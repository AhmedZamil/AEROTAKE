using System.Text.Json;
using StackExchange.Redis;

namespace Ota.CoreEngine.Suppliers;

/// <summary>What a customer was shown for an offer, minus every price: the itinerary. Recorded at search time so a booking can
/// keep a copy of the flight it was made for — a supplier cache entry expires, and the "manage booking" page must still say
/// which flights these are long after. Prices are never in here: they are recomputed at booking.
/// <see cref="Currency"/> is the tenant sell currency the customer was quoted in; <see cref="SupplierCurrency"/> is the
/// currency the cached net/tax are still in (needed to convert again at revalidate/book).</summary>
public sealed record OfferSnapshot(
    string Title, string Currency, bool CheckedBaggageIncluded, double CheckedBaggageWeightKg,
    IReadOnlyList<FlightSegmentResult> Segments, string SupplierCurrency = "");

public interface IOfferSnapshots
{
    Task RegisterAsync(string tenantId, IEnumerable<(string OfferId, OfferSnapshot Snapshot)> offers, CancellationToken ct);

    /// <summary>Null if none was recorded for THIS tenant, or it has expired (indistinguishable on purpose).</summary>
    Task<OfferSnapshot?> GetAsync(string tenantId, string offerId, CancellationToken ct);
}

public sealed class RedisOfferSnapshots(IConnectionMultiplexer redis) : IOfferSnapshots
{
    // As long as the ownership record, which outlives the providers' 20-minute offer caches.
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(30);

    private static string Key(string tenantId, string offerId) => $"offer-snapshot:{tenantId}:{offerId}";

    public async Task RegisterAsync(string tenantId, IEnumerable<(string OfferId, OfferSnapshot Snapshot)> offers, CancellationToken ct)
    {
        var db = redis.GetDatabase();
        await Task.WhenAll(offers.GroupBy(o => o.OfferId).Select(g =>
            db.StringSetAsync(Key(tenantId, g.Key), JsonSerializer.Serialize(g.First().Snapshot), Ttl)));
    }

    public async Task<OfferSnapshot?> GetAsync(string tenantId, string offerId, CancellationToken ct)
    {
        var value = await redis.GetDatabase().StringGetAsync(Key(tenantId, offerId));
        if (!value.HasValue) return null;
        try { return JsonSerializer.Deserialize<OfferSnapshot>((string)value!); }
        catch (JsonException) { return null; }
    }
}
