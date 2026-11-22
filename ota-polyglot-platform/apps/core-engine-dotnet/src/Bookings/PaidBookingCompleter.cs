using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Messaging;
using Ota.CoreEngine.Payments;
using Ota.CoreEngine.Suppliers;

namespace Ota.CoreEngine.Bookings;

/// <summary>P4-5: after a B2C payment is Paid, issue the supplier ticket and Confirm — or refund if ticketing fails.
/// Idempotent: Confirmed bookings and already-refunded payments are no-ops; a Paid + still-Pending booking can be retried
/// (e.g. IPN replay after a crash between Paid and ticket). A timeout after the issue request was sent is not a failure:
/// the payment stays Paid, the booking stays Pending, and a later replay does not issue again.</summary>
public interface IPaidBookingCompleter
{
    Task CompleteAfterPaymentAsync(Guid paymentId, CancellationToken ct);
}

public sealed class PaidBookingCompleter(
    OtaDbContext db,
    ISupplierProvider suppliers,
    IPaymentGateway gateway,
    IWalletService wallets,
    IBookingEventProducer events,
    IBookingEmailService emails,
    ILogger<PaidBookingCompleter> logger) : IPaidBookingCompleter
{
    public async Task CompleteAfterPaymentAsync(Guid paymentId, CancellationToken ct)
    {
        // IPN has no tenant header — load across tenants.
        var payment = await db.Payments.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == paymentId, ct);
        if (payment is null) return;
        if (payment.Status is PaymentStatus.Refunded or PaymentStatus.Failed) return;
        if (payment.Status != PaymentStatus.Paid) return;

        var booking = await db.Bookings.IgnoreQueryFilters().FirstOrDefaultAsync(b => b.Id == payment.BookingId, ct);
        if (booking is null)
        {
            logger.LogError("Paid payment {PaymentId} has no booking {BookingId}", payment.Id, payment.BookingId);
            return;
        }

        if (booking.Status == BookingStatus.Confirmed) return;

        if (booking.Status != BookingStatus.Pending)
        {
            logger.LogWarning("Paid payment {PaymentId} but booking {Pnr} is {Status} — skipping ticket", payment.Id, booking.Pnr, booking.Status);
            return;
        }

        // A previous issue call timed out. Issuing again can sell the seat twice; refunding can refund a real ticket.
        if (await db.PaymentAttempts.IgnoreQueryFilters()
                .AnyAsync(a => a.PaymentId == payment.Id && a.FailureReason == TicketingUnknownMarker, ct))
        {
            logger.LogWarning("Paid booking {Pnr} already has an unknown ticket outcome — not issuing again and not refunding", booking.Pnr);
            return;
        }

        if (booking.TicketingDeadline is { } deadline && deadline <= DateTimeOffset.UtcNow)
        {
            logger.LogWarning("Payment {PaymentId} arrived after hold deadline for {Pnr} — refunding", payment.Id, booking.Pnr);
            await RefundAndFailBookingAsync(payment, booking, "hold_expired", "Payment received after the seat hold expired.", ct);
            return;
        }

        var holds = BookingLegs.Read(booking);
        if (holds.Count == 0)
        {
            logger.LogError("Paid booking {Pnr} has no supplier hold to ticket", booking.Pnr);
            return;
        }

        var issued = 0;
        foreach (var hold in holds)
        {
            TicketIssueResult ticketResult;
            try
            {
                ticketResult = await suppliers.IssueTicketAsync(hold.SupplierCode, hold.SupplierPnrId, booking.FinalPrice, ct);
            }
            catch (Exception ex)
            {
                // Leave Paid + Pending. Do not refund — the ticket may exist. A later leg must not be retried once an earlier one was issued.
                logger.LogError(ex, "Ticket issuance threw for paid booking {Pnr} supplier {SupplierPnr}; leaving Paid+Pending", booking.Pnr, hold.SupplierPnrId);
                if (issued > 0) await MarkTicketingUnknownAsync(payment.Id, ct);
                return;
            }

            if (ticketResult.Outcome == TicketIssueOutcome.Unknown)
            {
                logger.LogError("Ticket issuance outcome unknown for paid booking {Pnr} supplier {SupplierPnr}: {Reason}. Leaving Paid+Pending.",
                    booking.Pnr, hold.SupplierPnrId, ticketResult.FailureReason);
                await MarkTicketingUnknownAsync(payment.Id, ct);
                return;
            }

            if (!ticketResult.Success)
            {
                logger.LogError("Ticket issuance failed for paid booking {Pnr} supplier {SupplierPnr}: {Reason}",
                    booking.Pnr, hold.SupplierPnrId, ticketResult.FailureReason);
                // A later leg refusing after an earlier leg was ticketed must not refund the whole payment.
                if (issued > 0)
                {
                    await MarkTicketingUnknownAsync(payment.Id, ct);
                    return;
                }
                await RefundAndFailBookingAsync(
                    payment,
                    booking,
                    "ticket_failed",
                    ticketResult.FailureReason ?? "Supplier could not issue the ticket.",
                    ct);
                return;
            }

            issued++;
        }

        booking.Status = BookingStatus.Confirmed;
        booking.UpdatedAt = DateTimeOffset.UtcNow;
        await events.PublishBookingCreatedAsync(new BookingCreatedEvent(
            booking.Id.ToString(), booking.TenantId, booking.Channel,
            AgentId: null, SubAgentId: null,
            booking.Pnr, booking.OfferId, booking.FinalPrice, booking.Currency, booking.CreatedAt), ct);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Booking {Pnr} confirmed after payment {PaymentId}", booking.Pnr, payment.Id);
        await emails.NotifyTicketIssuedAsync(booking, ct);
    }

    private async Task RefundAndFailBookingAsync(
        Payment payment, Booking booking, string reasonCode, string remarks, CancellationToken ct)
    {
        var newlyFailed = booking.Status != BookingStatus.Failed;
        booking.Status = BookingStatus.Failed;
        booking.UpdatedAt = DateTimeOffset.UtcNow;

        // Idempotent: one successful refund row is enough.
        var existingOk = await db.Refunds.IgnoreQueryFilters()
            .AnyAsync(r => r.PaymentId == payment.Id && r.Status == RefundStatus.Succeeded, ct);
        if (existingOk || payment.Status == PaymentStatus.Refunded)
        {
            payment.Status = PaymentStatus.Refunded;
            payment.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            if (newlyFailed)
            {
                await emails.NotifyFailureAsync(booking, reasonCode, CustomerFailureMessage(reasonCode, remarks), ct);
            }
            return;
        }

        var refund = new Refund
        {
            TenantId = payment.TenantId,
            PaymentId = payment.Id,
            Amount = payment.Amount,
            Currency = payment.Currency,
            Status = RefundStatus.Pending,
            Reason = reasonCode.Length <= 200 ? reasonCode : reasonCode[..200],
        };
        db.Refunds.Add(refund);
        await db.SaveChangesAsync(ct);

        if (payment.Gateway == PaymentGateways.Wallet)
        {
            if (booking.CustomerId is { } customerId)
                await wallets.CreditAsync(payment.TenantId, customerId, payment.Amount, payment.Currency, booking.Id, remarks, ct);
            refund.Status = RefundStatus.Succeeded;
            refund.GatewayRef = "wallet";
            refund.UpdatedAt = DateTimeOffset.UtcNow;
            payment.Status = PaymentStatus.Refunded;
            payment.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            if (newlyFailed)
                await emails.NotifyFailureAsync(booking, reasonCode, CustomerFailureMessage(reasonCode, remarks), ct);
            return;
        }

        if (string.IsNullOrWhiteSpace(payment.GatewayRef))
        {
            logger.LogError("Cannot refund payment {PaymentId}: missing GatewayRef (bank_tran_id)", payment.Id);
            refund.Status = RefundStatus.Failed;
            refund.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            return;
        }

        // refund_trans_id max ~30 on SSLCommerz
        var refundTranId = refund.Id.ToString("N")[..24];
        GatewayRefundResult result;
        try
        {
            result = await gateway.RefundAsync(new GatewayRefundRequest(
                BankTranId: payment.GatewayRef,
                RefundTranId: refundTranId,
                Amount: payment.Amount,
                Remarks: remarks), ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Gateway refund threw for payment {PaymentId}", payment.Id);
            refund.Status = RefundStatus.Failed;
            refund.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            return;
        }

        if (result.Ok)
        {
            refund.Status = RefundStatus.Succeeded;
            refund.GatewayRef = result.GatewayRef;
            payment.Status = PaymentStatus.Refunded;
            payment.UpdatedAt = DateTimeOffset.UtcNow;
            logger.LogInformation("Refunded payment {PaymentId} after {Reason}", payment.Id, reasonCode);
        }
        else
        {
            refund.Status = RefundStatus.Failed;
            refund.GatewayRef = result.GatewayRef;
            logger.LogError("Gateway refund failed for payment {PaymentId}: {Status} {Error}",
                payment.Id, result.Status, result.ErrorReason);
        }

        refund.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        if (newlyFailed)
            await emails.NotifyFailureAsync(booking, reasonCode, CustomerFailureMessage(reasonCode, remarks), ct);
    }

    private static string CustomerFailureMessage(string reasonCode, string remarks) => reasonCode switch
    {
        "hold_expired" => "Your payment arrived after the seat hold expired, so we could not issue a ticket.",
        "ticket_failed" => "We received your payment but the airline could not issue the ticket.",
        _ => string.IsNullOrWhiteSpace(remarks)
            ? "We could not complete this booking."
            : remarks,
    };

    /// <summary>Written on the payment attempt so a later IPN does not call IssueTicket again. The attempt stays
    /// Succeeded — the customer did pay. <see cref="PaymentAttempt.FailureReason"/> is otherwise only set when checkout itself fails.</summary>
    public const string TicketingUnknownMarker = "ticketing_unknown";

    private async Task MarkTicketingUnknownAsync(Guid paymentId, CancellationToken ct)
    {
        var attempt = await db.PaymentAttempts.IgnoreQueryFilters()
            .Where(a => a.PaymentId == paymentId)
            .OrderByDescending(a => a.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (attempt is null)
        {
            logger.LogError("Paid payment {PaymentId} has an unknown ticket outcome but no payment attempt to record it on", paymentId);
            return;
        }

        attempt.FailureReason = TicketingUnknownMarker;
        attempt.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }
}
