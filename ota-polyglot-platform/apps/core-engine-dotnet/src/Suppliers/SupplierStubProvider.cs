using Ota.CoreEngine.Grpc;

namespace Ota.CoreEngine.Suppliers;

/// <summary>Deterministic offline fallback — the same fake data the original
/// SupplierStub produced, now behind ISupplierProvider so the rest of the
/// pipeline doesn't care whether it's talking to this or real Sabre.</summary>
public sealed class SupplierStubProvider : ISupplierProvider
{
    public string SupplierCode => "STUB";

    public Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct)
    {
        // The stub is quick: a search for the SLOW suppliers only (speed=slow) has nothing to add, so it must not repeat the quick answer.
        if (request.Filters.TryGetValue("speed", out var speed) && speed == "slow") return Task.FromResult<IReadOnlyList<SupplierOfferResult>>([]);

        var currency = request.Tenant?.Currency is { Length: > 0 } c ? c : "USD";

        // The price shown at search is the price used at revalidate and booking (NetRateForOffer), so a customer flow against the stub behaves
        // like one against a real supplier: quote, revalidate and reserve all agree. Each offer carries a real-looking itinerary (and a way back
        // for a round-trip search) so a storefront has something to show and a booking has something to record.
        IReadOnlyList<SupplierOfferResult> offers =
        [
            Offer("AMADEUS", "EK", "585", 9, request, currency),
            Offer("SABRE", "QR", "641", 13, request, currency),
            Offer("HOTELBEDS", "TK", "713", 6, request, currency),
        ];
        return Task.FromResult(offers);
    }

    public Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) => Task.FromResult(NetRateForOffer(offerId));

    // No tax concept in the deterministic fake data — always "unknown/none",
    // same as a real supplier that just doesn't report one.
    public Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) => Task.FromResult(0m);

    public Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct)
    {
        var current = NetRateForOffer(offerId);
        if (current is null) return Task.FromResult(new RevalidateResult(false, 0, "Offer expired or unknown."));
        return Task.FromResult(new RevalidateResult(current == expectedNetRate, current.Value, null));
    }

    public Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct)
    {
        var pnr = new string(Enumerable.Range(0, 6).Select(_ => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Random.Shared.Next(32)]).ToArray());
        return Task.FromResult(new SupplierBookingResult(true, pnr, null, "{}"));
    }

    public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct) =>
        Task.FromResult(new TicketIssueResult(true, null, "{}"));

    private static SupplierOfferResult Offer(string supplier, string carrier, string number, int departHour, SearchRequest request, string currency)
    {
        var id = $"{supplier}-{Guid.NewGuid():N}";
        var segments = new List<FlightSegmentResult> { Segment(carrier, number, request.Origin, request.Destination, request.CheckIn, departHour, 0) };
        if (!string.IsNullOrWhiteSpace(request.CheckOut))
            segments.Add(Segment(carrier, (int.Parse(number) + 1).ToString(), request.Destination, request.Origin, request.CheckOut, departHour + 1, 1));
        return new(id, supplier, NetRateForOffer(id)!.Value, $"{request.Origin} → {request.Destination} ({supplier})", currency, segments,
            CheckedBaggageIncluded: true, CheckedBaggageWeightKg: 30);
    }

    private static FlightSegmentResult Segment(string carrier, string number, string from, string to, string date, int hour, int leg)
    {
        var day = DateTime.TryParse(date, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d) ? d.Date : DateTime.UtcNow.Date.AddDays(30);
        var depart = day.AddHours(hour);
        var arrive = depart.AddHours(5);
        return new(carrier, number, from, to, new DateTimeOffset(depart, TimeSpan.Zero), new DateTimeOffset(arrive, TimeSpan.Zero), "Y", leg,
            depart.ToString("yyyy-MM-dd'T'HH:mm:ss"), arrive.ToString("yyyy-MM-dd'T'HH:mm:ss"));
    }

    public static decimal? NetRateForOffer(string offerId) =>
        offerId.StartsWith("AMADEUS") ? 220m :
        offerId.StartsWith("SABRE") ? 235m :
        offerId.StartsWith("HOTELBEDS") ? 190m : null;
}
