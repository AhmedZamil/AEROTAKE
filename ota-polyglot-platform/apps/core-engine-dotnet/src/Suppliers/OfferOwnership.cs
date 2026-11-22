using StackExchange.Redis;

namespace Ota.CoreEngine.Suppliers;

/// <summary>Records which tenants an offer id was issued to at search time, so
/// revalidate and booking can refuse an id that tenant never received. Supplier
/// providers cache offers by id alone and all tenants share one supplier
/// account, so this check lives in core, in front of every provider, instead of
/// being re-implemented per supplier.
///
/// One offer id can belong to several tenants: a shared raw search (C1-1) hands
/// the same airline offers to whoever searches that route while the list is warm.
/// Each of those tenants is added. A tenant that never searched is still refused.
///
/// Fail-closed: an id with no ownership record is treated as not owned.
/// Redis runs with allkeys-lru, so a record can be evicted while the provider's
/// own cache entry survives; failing open there would silently disable the check.</summary>
public interface IOfferOwnership
{
    Task RegisterAsync(string tenantId, IEnumerable<string> offerIds, CancellationToken ct);
    Task<bool> IsOwnedByAsync(string tenantId, string offerId, CancellationToken ct);
}

public sealed class RedisOfferOwnership(IConnectionMultiplexer redis) : IOfferOwnership
{
    // Longer than the providers' 20-minute offer caches, so ownership never
    // expires while a bookable cached offer still exists.
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(30);

    // A set, not a single tenant string. The previous string key was overwritten by the
    // next tenant to search the same offers, which would steal the first tenant's booking.
    private static string Key(string offerId) => $"offer-owners:{offerId}";

    public async Task RegisterAsync(string tenantId, IEnumerable<string> offerIds, CancellationToken ct)
    {
        var db = redis.GetDatabase();
        var batch = offerIds.Distinct().Select(async id =>
        {
            var key = Key(id);
            await db.SetAddAsync(key, tenantId);
            await db.KeyExpireAsync(key, Ttl);
        }).ToArray();
        await Task.WhenAll(batch);
    }

    public async Task<bool> IsOwnedByAsync(string tenantId, string offerId, CancellationToken ct) =>
        await redis.GetDatabase().SetContainsAsync(Key(offerId), tenantId);
}
