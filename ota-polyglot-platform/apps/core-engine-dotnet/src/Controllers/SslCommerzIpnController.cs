using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Controllers;

/// <summary>SSLCommerz IPN (instant payment notification). Anonymous by design — authenticity is the store credentials
/// on the validation API call. On valid payment: marks Paid, then tickets the booking (P4-5).</summary>
[ApiController]
[Route("api/v1/payments/sslcommerz")]
[AllowAnonymous]
public sealed class SslCommerzIpnController(
    OtaDbContext db,
    Payments.IPaymentGateway gateway,
    IPaidBookingCompleter completer,
    Payments.IWalletTopUpService topUps,
    IBookingEmailService emails,
    ILogger<SslCommerzIpnController> logger) : ControllerBase
{
    [HttpPost("ipn")]
    public async Task<IActionResult> Ipn(CancellationToken ct)
    {
        string valId = "", tranId = "", raw = "";
        if (Request.HasFormContentType)
        {
            var form = await Request.ReadFormAsync(ct);
            valId = form["val_id"].ToString();
            tranId = form["tran_id"].ToString();
            raw = string.Join("&", form.Select(kv => $"{kv.Key}={kv.Value}"));
        }
        else if (Request.HasJsonContentType())
        {
            using var doc = await JsonDocument.ParseAsync(Request.Body, cancellationToken: ct);
            valId = doc.RootElement.TryGetProperty("val_id", out var v) ? v.GetString() ?? "" : "";
            tranId = doc.RootElement.TryGetProperty("tran_id", out var t) ? t.GetString() ?? "" : "";
            raw = doc.RootElement.GetRawText();
        }

        logger.LogInformation("SSLCommerz IPN received tran_id={TranId} val_id={ValId}", tranId, valId);

        if (string.IsNullOrWhiteSpace(valId))
            return BadRequest(new { error = "invalid_ipn", message = "val_id is required." });

        var validation = await gateway.ValidateAsync(new Payments.GatewayValidationRequest(valId), ct);
        var lookupTranId = !string.IsNullOrWhiteSpace(validation.TranId) ? validation.TranId : tranId;

        // Tenant is not on the IPN — look up by tran_id across tenants (IgnoreQueryFilters).
        var payment = string.IsNullOrWhiteSpace(lookupTranId)
            ? null
            : await db.Payments.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.TranId == lookupTranId, ct);
        if (payment is null)
        {
            var credited = await topUps.ConfirmFromGatewayAsync(lookupTranId, validation, ct);
            if (credited is null)
            {
                logger.LogWarning("SSLCommerz IPN for unknown tran_id {TranId}", lookupTranId);
                return Ok(new { received = true }); // do not teach attackers which ids exist
            }
            return Ok(new { received = true, valid = credited.Value });
        }

        // Already Paid: still attempt ticketing (crash between Paid and Confirm) — completer is idempotent.
        if (payment.Status == PaymentStatus.Paid)
        {
            await completer.CompleteAfterPaymentAsync(payment.Id, ct);
            return Ok(new { received = true, valid = true });
        }

        var attempt = await db.PaymentAttempts.IgnoreQueryFilters()
            .Where(a => a.PaymentId == payment.Id)
            .OrderByDescending(a => a.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (attempt is not null)
        {
            attempt.GatewayEventJson = raw.Length > 8000 ? raw[..8000] : raw;
            attempt.UpdatedAt = DateTimeOffset.UtcNow;
        }

        var amountOk = decimal.Round(validation.Amount, 2) == decimal.Round(payment.Amount, 2);
        if (!validation.Ok
            || !string.Equals(validation.TranId, payment.TranId, StringComparison.Ordinal)
            || !amountOk
            || !string.Equals(validation.Currency, payment.Currency, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning("SSLCommerz IPN validation failed for {TranId}: status={Status}", lookupTranId, validation.Status);
            var newlyFailed = payment.Status != PaymentStatus.Failed;
            if (attempt is not null) attempt.Status = PaymentAttemptStatus.Failed;
            payment.Status = PaymentStatus.Failed;
            payment.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            if (newlyFailed)
            {
                var booking = await db.Bookings.IgnoreQueryFilters().FirstOrDefaultAsync(b => b.Id == payment.BookingId, ct);
                if (booking is not null)
                {
                    await emails.NotifyFailureAsync(booking, "payment_failed",
                        "Your payment was not completed, so no ticket was issued.", ct);
                }
            }
            return Ok(new { received = true, valid = false });
        }

        payment.Status = PaymentStatus.Paid;
        payment.GatewayRef = validation.GatewayRef;
        payment.PaidAt = DateTimeOffset.UtcNow;
        payment.UpdatedAt = DateTimeOffset.UtcNow;
        if (attempt is not null) attempt.Status = PaymentAttemptStatus.Succeeded;
        await db.SaveChangesAsync(ct);

        var paidBooking = await db.Bookings.IgnoreQueryFilters().FirstOrDefaultAsync(b => b.Id == payment.BookingId, ct);
        if (paidBooking is not null)
            await emails.NotifyPaymentReceivedAsync(paidBooking, payment, ct);

        await completer.CompleteAfterPaymentAsync(payment.Id, ct);

        return Ok(new { received = true, valid = true });
    }
}
