using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Payments;

public sealed record CardTopUpStart(Guid TopUpId, string GatewayPageUrl, decimal Amount, string Currency, bool Replayed);
public sealed record CardTopUpView(Guid TopUpId, string Status, decimal Amount, string Currency, decimal Balance);

public interface IWalletTopUpService
{
    Task<CardTopUpStart> StartCardAsync(Caller caller, decimal amount, string? idempotencyKey, CancellationToken ct);
    Task<CardTopUpView> GetAsync(Caller caller, Guid topUpId, CancellationToken ct);

    /// <summary>Credits the wallet once when the gateway validation matches this top-up. True when the money is now in the balance.</summary>
    Task<bool?> ConfirmFromGatewayAsync(string? tranId, GatewayValidationResult validation, CancellationToken ct);
}

public sealed class WalletTopUpService(
    OtaDbContext db,
    IPaymentGateway gateway,
    IWalletService wallets,
    IOptions<SslCommerzOptions> sslOptions,
    IConfiguration config,
    ILogger<WalletTopUpService> logger) : IWalletTopUpService
{
    public async Task<CardTopUpStart> StartCardAsync(Caller caller, decimal amount, string? idempotencyKey, CancellationToken ct)
    {
        var customerId = RequireCustomer(caller);
        if (amount is < 1 or > 100_000)
            throw new ServiceException(ErrorKind.InvalidArgument, "Enter an amount between 1 and 100,000.");

        var key = string.IsNullOrWhiteSpace(idempotencyKey) ? Guid.NewGuid().ToString("N") : idempotencyKey.Trim();
        if (key.Length > 100) throw new ServiceException(ErrorKind.InvalidArgument, "idempotencyKey is too long.");

        var existing = await db.WalletTopUps.FirstOrDefaultAsync(t => t.IdempotencyKey == key, ct);
        if (existing is not null)
        {
            if (existing.CustomerId != customerId)
                throw new ServiceException(ErrorKind.FailedPrecondition, "idempotency_key is already in use.");
            if (existing.Status is PaymentStatus.Initiated or PaymentStatus.Pending && !string.IsNullOrWhiteSpace(existing.GatewayPageUrl))
                return new CardTopUpStart(existing.Id, existing.GatewayPageUrl, existing.Amount, existing.Currency, Replayed: true);
            if (existing.Status == PaymentStatus.Paid)
                throw new ServiceException(ErrorKind.FailedPrecondition, "This top-up was already paid.", "topup_already_paid");
            throw new ServiceException(ErrorKind.FailedPrecondition, "The previous top-up did not finish. Please try again.", "topup_retry_required");
        }

        var currency = await db.Tenants.AsNoTracking().Where(t => t.TenantId == caller.TenantId).Select(t => t.SellCurrency).FirstOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(currency)) currency = "BDT";
        var wallet = await db.CustomerWallets.AsNoTracking().FirstOrDefaultAsync(w => w.CustomerId == customerId, ct);
        if (wallet is not null && !string.Equals(wallet.Currency, currency, StringComparison.OrdinalIgnoreCase))
            throw new ServiceException(ErrorKind.FailedPrecondition, "This wallet is in a different currency from the store.", "wallet_currency");

        var topUp = new WalletTopUp
        {
            TenantId = caller.TenantId,
            CustomerId = customerId,
            Amount = decimal.Round(amount, 2),
            Currency = currency,
            Status = PaymentStatus.Pending,
            Gateway = PaymentGateways.SslCommerz,
            TranId = "W" + Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant(),
            IdempotencyKey = key,
        };
        db.WalletTopUps.Add(topUp);
        await db.SaveChangesAsync(ct);

        var customer = await db.Customers.AsNoTracking().FirstAsync(c => c.Id == customerId, ct);
        var name = string.Join(' ', new[] { customer.FirstName, customer.LastName }.Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
        if (string.IsNullOrWhiteSpace(name)) name = "Customer";
        var storefront = StorefrontBase();
        var corePublic = CorePublicBase();

        try
        {
            var init = await gateway.InitiateAsync(new GatewayInitRequest(
                TranId: topUp.TranId,
                Amount: topUp.Amount,
                Currency: topUp.Currency,
                SuccessUrl: $"{storefront}/api/payments/sslcommerz/browser-return?status=success&topUpId={topUp.Id:D}",
                FailUrl: $"{storefront}/api/payments/sslcommerz/browser-return?status=fail&topUpId={topUp.Id:D}",
                CancelUrl: $"{storefront}/api/payments/sslcommerz/browser-return?status=cancel&topUpId={topUp.Id:D}",
                IpnUrl: $"{corePublic}/api/v1/payments/sslcommerz/ipn",
                CustomerName: name,
                CustomerEmail: customer.Email ?? "customer@example.test",
                CustomerPhone: "",
                ProductName: "Aerotake wallet top-up"), ct);

            topUp.GatewayPageUrl = init.GatewayPageUrl;
            topUp.Status = PaymentStatus.Initiated;
            topUp.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Wallet top-up {TopUpId} initiated for {Amount} {Currency}", topUp.Id, topUp.Amount, topUp.Currency);
            return new CardTopUpStart(topUp.Id, init.GatewayPageUrl, topUp.Amount, topUp.Currency, Replayed: false);
        }
        catch
        {
            topUp.Status = PaymentStatus.Failed;
            topUp.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            throw;
        }
    }

    public async Task<CardTopUpView> GetAsync(Caller caller, Guid topUpId, CancellationToken ct)
    {
        var customerId = RequireCustomer(caller);
        var topUp = await db.WalletTopUps.AsNoTracking().FirstOrDefaultAsync(t => t.Id == topUpId && t.CustomerId == customerId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Top-up not found.");
        var balance = await wallets.GetAsync(caller, instantTopUp: false, ct);
        return new CardTopUpView(topUp.Id, topUp.Status.ToString(), topUp.Amount, topUp.Currency, balance.Balance);
    }

    public async Task<bool?> ConfirmFromGatewayAsync(string? tranId, GatewayValidationResult validation, CancellationToken ct)
    {
        var lookup = !string.IsNullOrWhiteSpace(validation.TranId) ? validation.TranId : tranId;
        if (string.IsNullOrWhiteSpace(lookup)) return null;
        var topUp = await db.WalletTopUps.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(t => t.TranId == lookup, ct);
        if (topUp is null) return null;

        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var now = DateTimeOffset.UtcNow;
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""UPDATE payments."WalletTopUps" SET "UpdatedAt" = {now} WHERE "Id" = {topUp.Id}""", ct);
            var current = await db.WalletTopUps.IgnoreQueryFilters().FirstAsync(t => t.Id == topUp.Id, ct);
            if (current.Status == PaymentStatus.Paid)
            {
                await tx.CommitAsync(ct);
                return true;
            }

            var amountOk = decimal.Round(validation.Amount, 2) == decimal.Round(current.Amount, 2);
            var matches = validation.Ok
                && string.Equals(validation.TranId, current.TranId, StringComparison.Ordinal)
                && amountOk
                && string.Equals(validation.Currency, current.Currency, StringComparison.OrdinalIgnoreCase);
            if (!matches)
            {
                current.Status = PaymentStatus.Failed;
                current.UpdatedAt = now;
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                logger.LogWarning("Wallet top-up {TopUpId} was not confirmed by the gateway", current.Id);
                return false;
            }

            await wallets.CreditAsync(current.TenantId, current.CustomerId, current.Amount, current.Currency, null, $"Card top-up {current.Id:N}", ct);
            current.Status = PaymentStatus.Paid;
            current.GatewayRef = validation.GatewayRef;
            current.PaidAt = now;
            current.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            logger.LogInformation("Wallet top-up {TopUpId} credited {Amount} {Currency}", current.Id, current.Amount, current.Currency);
            return true;
        });
    }

    private static Guid RequireCustomer(Caller caller)
    {
        if (caller.ActorType != ActorTypes.Customer || caller.CustomerId is null || caller.Channel != BookingChannels.B2C)
            throw new ServiceException(ErrorKind.PermissionDenied, "Sign in to use your wallet.");
        return caller.CustomerId.Value;
    }

    private string StorefrontBase()
    {
        var fromOpt = sslOptions.Value.StorefrontPublicUrl?.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(fromOpt)) return fromOpt;
        var fromEnv = config["STOREFRONT_PUBLIC_URL"]?.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(fromEnv)) return fromEnv;
        throw new ServiceException(ErrorKind.FailedPrecondition, "STOREFRONT_PUBLIC_URL is required to start a payment.");
    }

    private string CorePublicBase()
    {
        var fromOpt = sslOptions.Value.CorePublicUrl?.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(fromOpt)) return fromOpt;
        return "http://localhost:8080";
    }
}
