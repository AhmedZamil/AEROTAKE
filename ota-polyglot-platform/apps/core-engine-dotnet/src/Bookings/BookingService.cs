using System.Text.Json;
using Google.Protobuf.WellKnownTypes;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Ledger;
using Ota.CoreEngine.Messaging;
using Ota.CoreEngine.Pricing;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Suppliers;
using GrpcContract = Ota.CoreEngine.Grpc;
using DomainCore = Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Bookings;

/// <summary>Booking is a two-phase pipeline (ported from AeroTake's actual behavior, where a booking exists
/// before it's paid/ticketed):
///   ReserveAsync      -> reserves the PNR with the supplier, Pending, no debit.
///   IssueTicketAsync  -> pays via AgentCreditService, tickets with the supplier, Confirmed, publishes outbox events.
/// Takes an already-authenticated <see cref="Caller"/> and reports business failures as
/// <see cref="ServiceException"/>; it knows nothing about the transport it is called over.</summary>
public interface IBookingService
{
    Task<GrpcContract.BookingConfirmation> ReserveAsync(Caller caller, GrpcContract.B2BBookingRequest request, CancellationToken ct);
    Task<GrpcContract.BookingConfirmation> IssueTicketAsync(Caller caller, GrpcContract.IssueTicketRequest request, CancellationToken ct);
}

public sealed class BookingService(
    OtaDbContext db,
    IMarkupResolver markups,
    IPricingCalculator pricing,
    ICurrencyConversion fx,
    IAgentCreditService credit,
    IBookingEventProducer events,
    ISupplierProvider suppliers,
    IOfferOwnership offerOwnership,
    IOfferSnapshots snapshots,
    ILogger<BookingService> logger) : IBookingService
{
    private static readonly TimeSpan TicketingWindow = TimeSpan.FromHours(24); // AeroTake's ticketing_last_date equivalent

    public async Task<GrpcContract.BookingConfirmation> ReserveAsync(Caller caller, GrpcContract.B2BBookingRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            throw new ServiceException(ErrorKind.InvalidArgument, "idempotency_key is required.");
        if (caller.AgentId is not { } agentId)
            throw new ServiceException(ErrorKind.InvalidArgument, "A valid agent_id is required for B2B bookings.");
        // This is the agent-paid flow; a consumer channel books through its own flow (payment, not agent credit).
        if (!BookingChannels.AgentOwned.Contains(caller.Channel))
            throw new ServiceException(ErrorKind.PermissionDenied, $"Channel '{caller.Channel}' cannot make agent-credit bookings.");

        // Idempotent replay: return the original confirmation — but only to the caller who made it. The key is unique per
        // tenant, so another agency that reuses (or guesses) it must not be handed this booking's PNR and price.
        var existing = await db.Bookings.FirstOrDefaultAsync(x => x.IdempotencyKey == request.IdempotencyKey, ct);
        if (existing is not null)
        {
            if (!BookingAccess.CanControl(caller, existing.Owner()))
                throw new ServiceException(ErrorKind.FailedPrecondition, "idempotency_key is already in use.");
            return ToConfirmation(existing, balanceAfter: 0);
        }

        var agent = await db.Agents.FirstOrDefaultAsync(a => a.Id == agentId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Agent not found for tenant.");

        if (!agent.IsActive)
            throw new ServiceException(ErrorKind.FailedPrecondition, "This agency's account has been deactivated.");

        // The sub-agent named in the request is only a claim: it must actually sit under the calling agent,
        // or margin and attribution could be pointed at anyone's agency.
        Guid? subAgentId = Guid.TryParse(request.Tenant?.SubAgentId, out var claimedSub) ? claimedSub : null;
        if (subAgentId is { } sub && !await db.Agents.AnyAsync(a => a.Id == sub && a.ParentAgentId == agent.Id, ct))
            throw new ServiceException(ErrorKind.PermissionDenied, "sub_agent_id is not a sub-agent of the calling agent.");

        var rule = await markups.ResolveRuleAsync(caller, agent.Tier, ProductTypes.Flight, ct);

        // The offer must have been issued to THIS tenant's search (same message as
        // unknown/expired, so another tenant's ids aren't revealed).
        if (!await offerOwnership.IsOwnedByAsync(caller.TenantId, request.OfferId, ct))
            throw new ServiceException(ErrorKind.FailedPrecondition, ErrorMessages.OfferExpiredOrUnknown);

        // Re-price from the supplier net rate — never trust a client-sent price.
        var netRate = await suppliers.GetCachedNetRateAsync(request.OfferId, ct)
            ?? throw new ServiceException(ErrorKind.FailedPrecondition, ErrorMessages.OfferExpiredOrUnknown);
        // Same tax the search response showed, cached alongside the net
        // rate (see SabreProvider.BuildCacheableOffer) — without this the
        // booking total would drift back below what the customer was
        // quoted, the exact bug this whole change fixes.
        var taxAmount = await suppliers.GetCachedTaxAmountAsync(request.OfferId, ct);

        // Supplier cache is in the supplier's currency; convert to the tenant's sell currency before markup.
        // The request's Tenant.Currency label is ignored (P4-10 / F11).
        var snapshot = await snapshots.GetAsync(caller.TenantId, request.OfferId, ct);
        var fromCurrency = !string.IsNullOrWhiteSpace(snapshot?.SupplierCurrency)
            ? snapshot!.SupplierCurrency
            : snapshot?.Currency ?? "USD";
        var (net, tax, currency) = await fx.ToSellCurrencyAsync(caller.TenantId, netRate, taxAmount, fromCurrency, ct);
        var quote = pricing.Calculate(net, agent.Tier, rule, subAgentMarginOverride: null, currency, tax);

        // Reserve with the supplier — no payment yet, matches AeroTake's
        // actual behavior (a booking exists before it's paid/ticketed).
        var reservation = await suppliers.CreateBookingAsync(request, ct);
        if (!reservation.Success)
            throw new ServiceException(ErrorKind.FailedPrecondition, reservation.FailureReason ?? "Supplier booking reservation failed.");

        var booking = new DomainCore.Booking
        {
            TenantId = caller.TenantId,
            Channel = caller.Channel,
            Pnr = PnrGenerator.Next(),
            OfferId = request.OfferId,
            SupplierCode = request.OfferId.Split('-')[0],
            AgentId = agent.Id,
            SubAgentId = subAgentId,
            CustomerEmail = request.ContactEmail,
            SupplierNetRate = quote.SupplierNetRate,
            AgentMarkupPercent = quote.AgentMarkupPercent,
            SubAgentMargin = quote.SubAgentMargin,
            FinalPrice = quote.FinalPrice,
            Currency = quote.Currency,
            IdempotencyKey = request.IdempotencyKey,
            TravelersJson = JsonSerializer.Serialize(request.Travelers.Select(t => new { t.FirstName, t.LastName, t.DocumentType, t.DocumentNumber })),
            Status = DomainCore.BookingStatus.Pending,
            SupplierPnrId = reservation.SupplierPnrId,
            TicketingDeadline = DateTimeOffset.UtcNow.Add(TicketingWindow),
        };
        db.Bookings.Add(booking);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Booking {Pnr} reserved (supplier PNR {SupplierPnrId}) for agent {AgentId}, pending ticket issuance",
            booking.Pnr, booking.SupplierPnrId, agent.Id);

        return ToConfirmation(booking, balanceAfter: agent.AvailableCredit);
    }

    public async Task<GrpcContract.BookingConfirmation> IssueTicketAsync(Caller caller, GrpcContract.IssueTicketRequest request, CancellationToken ct)
    {
        if (!Guid.TryParse(request.BookingId, out var bookingId))
            throw new ServiceException(ErrorKind.InvalidArgument, "A valid booking_id is required.");

        // Scoped to what the caller may act on, not just the tenant: another agency in the same tenant that learns a booking
        // id must not be able to ticket it (and be answered exactly as if it didn't exist).
        var booking = await db.Bookings.ControlledBy(caller).FirstOrDefaultAsync(b => b.Id == bookingId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Booking not found for tenant.");

        // Idempotent replay: already ticketed, don't charge twice.
        if (booking.Status == DomainCore.BookingStatus.Confirmed)
            return ToConfirmation(booking, balanceAfter: 0);

        if (booking.Status != DomainCore.BookingStatus.Pending)
            throw new ServiceException(ErrorKind.FailedPrecondition, $"Booking is {booking.Status}, not eligible for ticketing.");

        if (booking.TicketingDeadline is { } deadline && deadline < DateTimeOffset.UtcNow)
        {
            booking.Status = DomainCore.BookingStatus.RejectedExpired;
            await db.SaveChangesAsync(ct);
            return ToConfirmation(booking, balanceAfter: 0, failure: "Ticketing deadline has passed.");
        }

        if (booking.AgentId is not { } agentId)
            throw new ServiceException(ErrorKind.FailedPrecondition, "Booking has no associated agent.");

        // Payment gate — reuse the same optimistic-concurrency-safe ledger
        // debit ProcessB2BBooking used to do inline; this is the "port to
        // the better thing already in this codebase" decision from the plan.
        var check = await credit.VerifyAndReserveAsync(agentId, booking.FinalPrice, booking.Id, $"PNR:{booking.Pnr}", ct);
        if (!check.Approved)
        {
            booking.Status = DomainCore.BookingStatus.RejectedCredit;
            await db.SaveChangesAsync(ct);
            return ToConfirmation(booking, check.AvailableAfter, check.Reason);
        }

        TicketIssueResult ticketResult;
        try
        {
            ticketResult = await suppliers.IssueTicketAsync(booking.SupplierCode, booking.SupplierPnrId ?? booking.Pnr, booking.FinalPrice, ct);
        }
        catch
        {
            // A timeout/transport error must not leave the reservation stuck on
            // the agent's credit. The booking stays Pending so the agent can
            // retry (a retry re-reserves), and the caller still sees the error.
            await credit.ReleaseAsync(agentId, booking.FinalPrice, booking.Id, $"PNR:{booking.Pnr}:ticket-error", CancellationToken.None);
            throw;
        }
        if (!ticketResult.Success)
        {
            // Payment was reserved but ticketing failed at the supplier —
            // release the credit rather than leaving the agent charged for
            // a ticket that doesn't exist.
            await credit.ReleaseAsync(agentId, booking.FinalPrice, booking.Id, $"PNR:{booking.Pnr}:ticket-failed", ct);
            booking.Status = DomainCore.BookingStatus.Failed;
            await db.SaveChangesAsync(ct);

            // check.AvailableAfter reflects the balance right after the debit —
            // re-read post-release so the response doesn't show a stale (lower)
            // balance for a charge that was just reversed.
            var balanceAfterRelease = await db.Agents.Where(a => a.Id == agentId).Select(a => a.CreditLimit - a.CreditUsed).FirstAsync(ct);

            logger.LogError("Ticket issuance failed for booking {Pnr}: {Reason}", booking.Pnr, ticketResult.FailureReason);
            return ToConfirmation(booking, balanceAfterRelease, ticketResult.FailureReason ?? "Ticket issuance failed.");
        }

        booking.Status = DomainCore.BookingStatus.Confirmed;

        // Staged on the same OtaDbContext, not sent anywhere yet — the single
        // SaveChangesAsync below commits the booking status and both outbox
        // rows atomically, so an event can never be lost after this commits.
        await events.PublishBookingCreatedAsync(new BookingCreatedEvent(
            booking.Id.ToString(), booking.TenantId, caller.Channel,
            booking.AgentId?.ToString(), booking.SubAgentId?.ToString(),
            booking.Pnr, booking.OfferId, booking.FinalPrice, booking.Currency, booking.CreatedAt), ct);

        await events.PublishCreditDeductedAsync(new AgentCreditDeductedEvent(
            booking.TenantId, agentId.ToString(), booking.Id.ToString(),
            booking.FinalPrice, check.AvailableAfter, DateTimeOffset.UtcNow), ct);

        await db.SaveChangesAsync(ct);

        logger.LogInformation("Booking {Pnr} ticketed for agent {AgentId} at {Price} {Currency}",
            booking.Pnr, agentId, booking.FinalPrice, booking.Currency);

        return ToConfirmation(booking, check.AvailableAfter);
    }

    private static GrpcContract.BookingConfirmation ToConfirmation(DomainCore.Booking b, decimal balanceAfter, string? failure = null) => new()
    {
        BookingId = b.Id.ToString(),
        Pnr = b.Pnr,
        Status = b.Status switch
        {
            DomainCore.BookingStatus.Confirmed => GrpcContract.BookingStatus.Confirmed,
            DomainCore.BookingStatus.RejectedCredit => GrpcContract.BookingStatus.RejectedCredit,
            DomainCore.BookingStatus.RejectedExpired => GrpcContract.BookingStatus.RejectedExpired,
            DomainCore.BookingStatus.Pending => GrpcContract.BookingStatus.Pending,
            _ => GrpcContract.BookingStatus.Failed
        },
        Price = new GrpcContract.PriceBreakdown
        {
            SupplierNetRate = (double)b.SupplierNetRate,
            AgentMarkupPct = (double)b.AgentMarkupPercent,
            SubAgentMargin = (double)b.SubAgentMargin,
            FinalPrice = (double)b.FinalPrice,
            Currency = b.Currency
        },
        AgentBalanceAfter = (double)balanceAfter,
        CreatedAt = Timestamp.FromDateTimeOffset(b.CreatedAt),
        FailureReason = failure ?? string.Empty
    };
}

internal static class PnrGenerator
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    public static string Next() =>
        new(Enumerable.Range(0, 6).Select(_ => Alphabet[Random.Shared.Next(Alphabet.Length)]).ToArray());
}
