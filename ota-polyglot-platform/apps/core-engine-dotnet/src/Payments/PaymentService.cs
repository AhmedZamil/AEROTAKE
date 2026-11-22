using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Payments;

public sealed class PaymentService(
    OtaDbContext db,
    IPaymentGateway gateway,
    IWalletService wallets,
    IPaidBookingCompleter completer,
    IOptions<SslCommerzOptions> sslOptions,
    IConfiguration config,
    ILogger<PaymentService> logger) : IPaymentService
{
    public async Task<StartPaymentResult> StartAsync(Caller caller, StartPaymentRequest request, CancellationToken ct)
    {
        if (caller.ActorType != ActorTypes.Customer || caller.CustomerId is null || caller.Channel != BookingChannels.B2C)
            throw new ServiceException(ErrorKind.PermissionDenied, "Sign in to pay for a booking.");

        var method = request.Method == PaymentGateways.Wallet ? PaymentGateways.Wallet : PaymentGateways.SslCommerz;

        var key = string.IsNullOrWhiteSpace(request.IdempotencyKey)
            ? Guid.NewGuid().ToString("N")
            : request.IdempotencyKey.Trim();
        if (key.Length > 100) throw new ServiceException(ErrorKind.InvalidArgument, "idempotencyKey is too long.");

        var existingAttempt = await db.PaymentAttempts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.IdempotencyKey == key, ct);
        if (existingAttempt is not null)
        {
            var existingPayment = await db.Payments.AsNoTracking().FirstAsync(p => p.Id == existingAttempt.PaymentId, ct);
            if (existingPayment.BookingId != request.BookingId)
                throw new ServiceException(ErrorKind.FailedPrecondition, "idempotency_key is already in use.");
            if (existingPayment.Gateway == PaymentGateways.Wallet && existingPayment.Status == PaymentStatus.Paid)
            {
                var status = await db.Bookings.AsNoTracking().Where(b => b.Id == existingPayment.BookingId).Select(b => b.Status).FirstAsync(ct);
                return new StartPaymentResult(existingPayment.Id, existingPayment.TranId, null, Replayed: true, PaymentGateways.Wallet, Paid: true, status.ToString());
            }
            if (string.IsNullOrWhiteSpace(existingAttempt.GatewayPageUrl)
                || existingAttempt.Status == PaymentAttemptStatus.Failed
                || existingPayment.Status == PaymentStatus.Failed)
                throw new ServiceException(
                    ErrorKind.FailedPrecondition,
                    "A previous payment attempt failed. Please try again.",
                    "payment_retry_required");
            return new StartPaymentResult(existingPayment.Id, existingPayment.TranId, existingAttempt.GatewayPageUrl, Replayed: true, existingPayment.Gateway, existingPayment.Status == PaymentStatus.Paid);
        }

        if (method == PaymentGateways.Wallet)
            return await PayWithWalletAsync(caller, request.BookingId, key, ct);

        var booking = await db.Bookings.ControlledBy(caller).FirstOrDefaultAsync(b => b.Id == request.BookingId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Booking not found.");
        if (booking.Status != BookingStatus.Pending)
            throw new ServiceException(ErrorKind.FailedPrecondition, "This booking cannot be paid.");
        if (booking.TicketingDeadline is { } deadline && deadline <= DateTimeOffset.UtcNow)
            throw new ServiceException(ErrorKind.FailedPrecondition, "The hold on these seats has expired.");

        var alreadyPaid = await db.Payments.AnyAsync(p => p.BookingId == booking.Id && p.Status == PaymentStatus.Paid, ct);
        if (alreadyPaid)
            throw new ServiceException(ErrorKind.FailedPrecondition, "This booking is already paid.");

        var storefront = ResolveStorefrontBase();
        var corePublic = ResolveCorePublicBase();
        var tranId = BuildTranId(booking.Pnr);

        var payment = new Payment
        {
            TenantId = caller.TenantId,
            BookingId = booking.Id,
            Amount = booking.FinalPrice,
            Currency = booking.Currency,
            Status = PaymentStatus.Pending,
            Gateway = gateway.Name,
            TranId = tranId,
        };
        var attempt = new PaymentAttempt
        {
            TenantId = caller.TenantId,
            PaymentId = payment.Id,
            IdempotencyKey = key,
            Status = PaymentAttemptStatus.Created,
        };

        db.Payments.Add(payment);
        db.PaymentAttempts.Add(attempt);
        await db.SaveChangesAsync(ct);

        var customer = await db.Customers.AsNoTracking().FirstAsync(c => c.Id == caller.CustomerId, ct);
        var name = string.Join(' ', new[] { customer.FirstName, customer.LastName }.Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
        if (string.IsNullOrWhiteSpace(name)) name = "Customer";

        try
        {
            // Browser return must be a URL that accepts SSLCommerz's POST (val_id). The storefront page is GET-only;
            // /api/payments/sslcommerz/browser-return forwards the form to our IPN handler then redirects to the UI.
            // That way Paid+ticket still happens when the separate IPN URL cannot reach local core (no tunnel).
            var init = await gateway.InitiateAsync(new GatewayInitRequest(
                TranId: tranId,
                Amount: booking.FinalPrice,
                Currency: booking.Currency,
                SuccessUrl: $"{storefront}/api/payments/sslcommerz/browser-return?status=success&bookingId={booking.Id:D}",
                FailUrl: $"{storefront}/api/payments/sslcommerz/browser-return?status=fail&bookingId={booking.Id:D}",
                CancelUrl: $"{storefront}/api/payments/sslcommerz/browser-return?status=cancel&bookingId={booking.Id:D}",
                IpnUrl: $"{corePublic}/api/v1/payments/sslcommerz/ipn",
                CustomerName: name,
                CustomerEmail: booking.CustomerEmail ?? customer.Email ?? "customer@example.test",
                CustomerPhone: "",
                ProductName: $"Flight {booking.Pnr}"), ct);

            attempt.SessionKey = init.SessionKey;
            attempt.GatewayPageUrl = init.GatewayPageUrl;
            attempt.Status = PaymentAttemptStatus.Redirected;
            payment.Status = PaymentStatus.Initiated;
            payment.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            logger.LogInformation("Payment {PaymentId} initiated for booking {Pnr} via {Gateway}", payment.Id, booking.Pnr, gateway.Name);
            return new StartPaymentResult(payment.Id, payment.TranId, init.GatewayPageUrl, Replayed: false, PaymentGateways.SslCommerz);
        }
        catch
        {
            attempt.Status = PaymentAttemptStatus.Failed;
            attempt.FailureReason = "gateway_init_failed";
            payment.Status = PaymentStatus.Failed;
            payment.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            throw;
        }
    }

    private async Task<StartPaymentResult> PayWithWalletAsync(Caller caller, Guid bookingId, string key, CancellationToken ct)
    {
        var booking = await db.Bookings.ControlledBy(caller).FirstOrDefaultAsync(b => b.Id == bookingId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Booking not found.");
        if (booking.Status != BookingStatus.Pending)
            throw new ServiceException(ErrorKind.FailedPrecondition, "This booking cannot be paid.");
        if (booking.TicketingDeadline is { } deadline && deadline <= DateTimeOffset.UtcNow)
            throw new ServiceException(ErrorKind.FailedPrecondition, "The hold on these seats has expired.");
        if (await db.Payments.AnyAsync(p => p.BookingId == booking.Id && p.Status == PaymentStatus.Paid, ct))
            throw new ServiceException(ErrorKind.FailedPrecondition, "This booking is already paid.");

        var entryId = await wallets.DebitForBookingAsync(caller, booking, ct);
        var payment = new Payment
        {
            TenantId = caller.TenantId,
            BookingId = booking.Id,
            Amount = booking.FinalPrice,
            Currency = booking.Currency,
            Status = PaymentStatus.Paid,
            Gateway = PaymentGateways.Wallet,
            TranId = BuildTranId(booking.Pnr),
            GatewayRef = entryId.ToString("N"),
            PaidAt = DateTimeOffset.UtcNow,
        };
        db.Payments.Add(payment);
        db.PaymentAttempts.Add(new PaymentAttempt
        {
            TenantId = caller.TenantId,
            PaymentId = payment.Id,
            IdempotencyKey = key,
            Status = PaymentAttemptStatus.Succeeded,
        });
        await db.SaveChangesAsync(ct);

        await completer.CompleteAfterPaymentAsync(payment.Id, ct);
        var status = await db.Bookings.AsNoTracking().Where(b => b.Id == booking.Id).Select(b => b.Status).FirstAsync(ct);
        logger.LogInformation("Wallet payment {PaymentId} for booking {Pnr} is {Status}", payment.Id, booking.Pnr, status);
        return new StartPaymentResult(payment.Id, payment.TranId, null, Replayed: false, PaymentGateways.Wallet, Paid: true, status.ToString());
    }

    private string ResolveStorefrontBase()
    {
        var fromOpt = sslOptions.Value.StorefrontPublicUrl?.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(fromOpt)) return fromOpt;
        var fromEnv = config["STOREFRONT_PUBLIC_URL"]?.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(fromEnv)) return fromEnv;
        throw new ServiceException(ErrorKind.FailedPrecondition, "STOREFRONT_PUBLIC_URL is required to start a payment.");
    }

    private string ResolveCorePublicBase()
    {
        var fromOpt = sslOptions.Value.CorePublicUrl?.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(fromOpt)) return fromOpt;
        // Local default — sandbox IPN will not reach localhost without a tunnel; init still works.
        return "http://localhost:8080";
    }

    private static string BuildTranId(string pnr)
    {
        // SSLCommerz tran_id max ~30; keep unique and readable.
        var suffix = Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant();
        var id = $"{pnr}-{suffix}";
        return id.Length <= 30 ? id : id[..30];
    }
}
