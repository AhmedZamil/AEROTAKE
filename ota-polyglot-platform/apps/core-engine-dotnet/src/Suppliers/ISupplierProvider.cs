using Ota.CoreEngine.Grpc;

namespace Ota.CoreEngine.Suppliers;

/// <summary>One flown segment of an offer's itinerary — mirrors the proto
/// FlightSegment message. LegIndex is 0 for outbound (or the only leg on a
/// one-way/multi-city search) and 1 for the return leg of a round trip.</summary>
public sealed record FlightSegmentResult(
    string AirlineCode,
    string FlightNumber,
    string Origin,
    string Destination,
    DateTimeOffset DepartureTime,
    DateTimeOffset ArrivalTime,
    string? BookingClass,
    int LegIndex,
    // Local wall-clock time at the origin/destination airport (no offset) —
    // see FlightSegment.departure_time_local in ota.proto for why this is
    // carried separately from the UTC DepartureTime/ArrivalTime above.
    string DepartureTimeLocal,
    string ArrivalTimeLocal);

public sealed record SupplierOfferResult(
    string OfferId,
    string SupplierCode,
    decimal NetRate,
    string Title,
    string Currency,
    IReadOnlyList<FlightSegmentResult>? Segments = null,
    // See SupplierOffer.checked_baggage_included/weight_kg in ota.proto —
    // false/0 means "not included or unknown", same ambiguity, same reason.
    bool CheckedBaggageIncluded = false,
    double CheckedBaggageWeightKg = 0,
    // Government/airport taxes and carrier fees — NOT part of NetRate above
    // (NetRate is base fare only, what agent markup applies to). Added to
    // the final price untouched by PricingCalculator; see its doc comment.
    decimal TaxAmount = 0m);

public sealed record RevalidateResult(
    bool Matches,
    decimal CurrentNetRate,
    string? FailureReason,
    // See SupplierOfferResult.TaxAmount above — same "not part of NetRate,
    // added untouched by PricingCalculator" tax, re-read at revalidate time.
    decimal CurrentTaxAmount = 0m,
    // Set only by CompositeSupplierProvider when the requested offer failed
    // but the same itinerary is still bookable via another supplier; the
    // Current* fields then describe THAT offer.
    string? ReplacementOfferId = null);

/// <summary>One search across one or more suppliers. Warnings name suppliers
/// that didn't contribute (down/timed out) so the UI can tell the agent the
/// list may be incomplete instead of silently showing fewer fares.</summary>
public sealed record SupplierSearchOutcome(
    IReadOnlyList<SupplierOfferResult> Offers,
    IReadOnlyList<string> Warnings);

public sealed record SupplierBookingResult(bool Success, string? SupplierPnrId, string? FailureReason, string RawResponseJson);

/// <summary>Issued: the supplier confirmed a ticket. Refused: the supplier answered and did not issue
/// (safe to refund). Unknown: the issue request was sent and the reply never came back — the ticket may exist.</summary>
public enum TicketIssueOutcome { Issued, Refused, Unknown }

public sealed record TicketIssueResult(bool Success, string? FailureReason, string RawResponseJson)
{
    /// <summary>Defaults from <see cref="Success"/> so existing call sites stay Refused-or-Issued.
    /// Set <see cref="TicketIssueOutcome.Unknown"/> when a timeout must not be treated as a refusal.</summary>
    public TicketIssueOutcome Outcome { get; init; } = Success ? TicketIssueOutcome.Issued : TicketIssueOutcome.Refused;
}

/// <summary>
/// Abstraction over the flight GDS. SupplierStubProvider (deterministic fake
/// data) is used automatically when Sabre credentials aren't configured —
/// see Program.cs registration — so local dev without real credentials keeps
/// working, same "no-op gracefully" philosophy as the alerting/email work.
/// </summary>
public interface ISupplierProvider
{
    /// <summary>Stable supplier code — also the prefix of every offer id this
    /// provider issues ("SABRE-{guid}"), which is how a composite routes
    /// revalidate/booking calls back to the owning supplier.</summary>
    string SupplierCode { get; }

    Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct);

    /// <summary>True for a supplier whose search routinely takes many seconds (Hajee's pre-production: 8-20 s). A caller can ask for the
    /// quick suppliers first (filter speed=fast) and the slow ones separately (speed=slow, with a longer time limit), so a slow supplier
    /// never holds back the fares that are ready.</summary>
    bool IsSlowSearch => false;

    /// <summary>Search plus partial-failure notes. Single-supplier providers
    /// inherit this default (no warnings); the composite overrides it.</summary>
    async Task<SupplierSearchOutcome> SearchWithWarningsAsync(SearchRequest request, CancellationToken ct) =>
        new(await SearchAsync(request, ct), []);

    /// <summary>Cheap cache-only lookup of the net rate quoted for an offer_id
    /// at search time — used by ProcessB2BBooking to price the reservation.
    /// Does NOT hit the GDS; that's what RevalidateAsync is for.</summary>
    Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct);

    /// <summary>Companion to GetCachedNetRateAsync — the tax/fee amount cached
    /// alongside the net rate at search time, added untouched to the final
    /// price at booking time so a booking's total matches what search showed.
    /// Returns 0 (not null) for an unknown offer_id or a supplier that has no
    /// tax concept, since a missing tax is never itself a reason to fail the
    /// booking the way a missing net rate is.</summary>
    Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct);

    /// <summary>Re-prices a previously-returned offer_id — must be called before
    /// booking; a client-sent price is never trusted (ported from AeroTake's
    /// flightRevalidate fare-mismatch check).</summary>
    Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct);

    /// <summary>Reserves the PNR only — no payment. Matches AeroTake's actual
    /// behavior: a booking exists before it's paid/ticketed.</summary>
    Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct);

    /// <summary>Pays for and issues the ticket. Called only after
    /// AgentCreditService has approved the debit.</summary>
    Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct);

    /// <summary>Best-effort release of an unticketed hold (abandoned cart / expired payment window).
    /// Default is a no-op so stub and suppliers without a cancel API keep working; failures must not throw —
    /// the booking is still marked cancelled locally.</summary>
    Task CancelHoldAsync(string supplierCode, string supplierPnrId, CancellationToken ct) => Task.CompletedTask;
}
