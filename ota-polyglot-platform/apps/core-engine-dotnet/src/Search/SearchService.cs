using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Google.Protobuf.WellKnownTypes;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Pricing;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Suppliers;
using StackExchange.Redis;
using GrpcContract = Ota.CoreEngine.Grpc;

namespace Ota.CoreEngine.Search;

/// <summary>Availability search and offer revalidation. Takes an already-authenticated <see cref="Caller"/> and
/// reports business failures as <see cref="ServiceException"/>, so it knows nothing about how the request
/// arrived. The request/response types are the platform's contract messages (ota.proto), the same ones the
/// suppliers already use.</summary>
public interface ISearchService
{
    Task<GrpcContract.SearchResponse> SearchAsync(Caller caller, GrpcContract.SearchRequest request, CancellationToken ct);
    Task<GrpcContract.RevalidateResponse> RevalidateAsync(Caller caller, GrpcContract.RevalidateRequest request, CancellationToken ct);
}

public sealed class SearchService(
    IMarkupResolver markups,
    IPricingCalculator pricing,
    ICurrencyConversion fx,
    ISupplierProvider suppliers,
    IOfferOwnership offerOwnership,
    IOfferSnapshots snapshots,
    IConnectionMultiplexer redis,
    IConfiguration config) : ISearchService
{
    private static readonly TimeSpan AvailabilityCacheTtl = TimeSpan.FromSeconds(90);
    // Empty in production. Tests set a value so one host cannot reuse another host's supplier results.
    private readonly string _cacheSalt = config["Search:CacheSalt"] ?? "";
    private static readonly JsonSerializerOptions RawJson = new(JsonSerializerDefaults.Web);

    /// <summary>The airline list for one search, before any tenant's markup. Shared by every caller
    /// (C1-1). Warnings are stored only for the response that just fetched them; a partial result is not cached.</summary>
    private sealed record RawAvailability(
        string SearchId,
        DateTimeOffset CachedAt,
        List<SupplierOfferResult> Offers,
        List<string> Warnings);

    public async Task<GrpcContract.SearchResponse> SearchAsync(Caller caller, GrpcContract.SearchRequest request, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var cache = redis.GetDatabase();
        var cacheKey = RawCacheKey(request);

        RawAvailability? raw = null;
        var cacheHit = false;
        var cached = await cache.StringGetAsync(cacheKey);
        if (cached.HasValue)
        {
            raw = JsonSerializer.Deserialize<RawAvailability>(cached.ToString(), RawJson);
            cacheHit = raw is not null;
        }

        if (raw is null)
        {
            var outcome = await suppliers.SearchWithWarningsAsync(request, ct);
            raw = new RawAvailability(
                Guid.NewGuid().ToString("N"),
                DateTimeOffset.UtcNow,
                outcome.Offers.ToList(),
                outcome.Warnings.ToList());
            // A supplier that failed to answer must not be frozen for 90 seconds as "no fares".
            if (raw.Warnings.Count == 0)
                await cache.StringSetAsync(cacheKey, JsonSerializer.Serialize(raw, RawJson), AvailabilityCacheTtl);
        }

        // Price with the tier this agent is actually BOOKED at (their DB row),
        // not whatever tier the caller claimed — otherwise the fare shown in
        // search differs from the fare charged at booking (seen: 4,439.50
        // shown, 4,322.30 booked). A caller with no agent is priced as Standard.
        // Markup and what this caller may see are applied now, never stored in the shared list.
        var tier = await markups.ResolveTierAsync(caller, ct);
        var rule = await markups.ResolveRuleAsync(caller, tier, request.ProductType.ToString(), ct);

        var quotes = new Dictionary<string, PriceQuote>(raw.Offers.Count);
        foreach (var offer in raw.Offers)
        {
            var (net, tax, currency) = await fx.ToSellCurrencyAsync(caller.TenantId, offer.NetRate, offer.TaxAmount, offer.Currency, ct);
            quotes[offer.OfferId] = pricing.Calculate(net, tier, rule, subAgentMarginOverride: null, currency, tax);
        }

        // Same flight from more than one supplier (or fare family): keep the
        // cheapest for THIS caller — markup is applied first so the comparison
        // is on the price they would actually see — and remember the
        // losers so a failed reprice can fall back to them.
        var merged = OfferMerger.Merge(raw.Offers, o => quotes[o.OfferId].FinalPrice);
        foreach (var (winnerId, altIds) in merged.Alternates)
        {
            var key = OfferAlternates.Key(winnerId);
            await cache.KeyDeleteAsync(key);
            await cache.ListRightPushAsync(key, altIds.Select(id => (RedisValue)id).ToArray());
            await cache.KeyExpireAsync(key, TimeSpan.FromMinutes(20));
        }

        var response = new GrpcContract.SearchResponse
        {
            SearchId = raw.SearchId,
            CacheHit = cacheHit
        };
        response.Warnings.AddRange(raw.Warnings);

        var consumer = IsConsumer(caller);
        var expiresAt = Timestamp.FromDateTimeOffset(raw.CachedAt.Add(AvailabilityCacheTtl));
        foreach (var offer in merged.Offers)
        {
            var quote = quotes[offer.OfferId];
            var supplierOffer = new GrpcContract.SupplierOffer
            {
                OfferId = offer.OfferId,
                // What a consumer may see is decided HERE, once: no net rate and no supplier for the public (P4-8). They pay the sell price and
                // learn nothing of our cost, margin or sourcing.
                SupplierCode = consumer ? "" : offer.SupplierCode,
                ProductType = request.ProductType,
                Title = offer.Title,
                NetRate = consumer ? 0 : (double)quote.SupplierNetRate,
                SellPrice = (double)quote.FinalPrice,
                Currency = quote.Currency,
                ExpiresAt = expiresAt,
                CheckedBaggageIncluded = offer.CheckedBaggageIncluded,
                CheckedBaggageWeightKg = offer.CheckedBaggageWeightKg,
            };
            if (offer.Segments is { Count: > 0 })
            {
                supplierOffer.Segments.AddRange(offer.Segments.Select(seg => new GrpcContract.FlightSegment
                {
                    AirlineCode = seg.AirlineCode,
                    FlightNumber = seg.FlightNumber,
                    Origin = seg.Origin,
                    Destination = seg.Destination,
                    DepartureTime = Timestamp.FromDateTimeOffset(seg.DepartureTime),
                    ArrivalTime = Timestamp.FromDateTimeOffset(seg.ArrivalTime),
                    DepartureTimeLocal = seg.DepartureTimeLocal,
                    ArrivalTimeLocal = seg.ArrivalTimeLocal,
                    BookingClass = seg.BookingClass ?? "",
                    LegIndex = seg.LegIndex,
                }));
            }
            response.Offers.Add(supplierOffer);
        }

        await offerOwnership.RegisterAsync(caller.TenantId,
            raw.Offers.Select(o => o.OfferId),
            ct);

        // Snapshot: sell currency for display; supplier currency so booking/revalidate can convert the cached net/tax again.
        await snapshots.RegisterAsync(caller.TenantId, merged.Offers.Select(o => (o.OfferId,
            new OfferSnapshot(o.Title, quotes[o.OfferId].Currency, o.CheckedBaggageIncluded, o.CheckedBaggageWeightKg, o.Segments ?? [],
                SupplierCurrency: o.Currency))), ct);

        response.LatencyMs = sw.ElapsedMilliseconds;
        return response;
    }

    /// <summary>Route and party only. Company, channel, agent tier and sell currency are applied after the list
    /// is read, so the agency site and the consumer site share one supplier call.</summary>
    private string RawCacheKey(GrpcContract.SearchRequest request)
    {
        var key =
            $"raw-avail:{request.ProductType}:{request.Origin}:{request.Destination}:" +
            $"{request.CheckIn}:{request.CheckOut}:{request.Adults}:{request.Children}:{request.Infants}:{request.Rooms}:" +
            string.Join(",", request.Filters.OrderBy(f => f.Key, StringComparer.Ordinal).Select(f => $"{f.Key}={f.Value}"));
        return _cacheSalt.Length == 0 ? key : $"{_cacheSalt}:{key}";
    }

    public async Task<GrpcContract.RevalidateResponse> RevalidateAsync(Caller caller, GrpcContract.RevalidateRequest request, CancellationToken ct)
    {
        if (!await offerOwnership.IsOwnedByAsync(caller.TenantId, request.OfferId, ct))
            return new GrpcContract.RevalidateResponse { Matches = false, FailureReason = ErrorMessages.OfferExpiredOrUnknown };

        var consumer = IsConsumer(caller);
        var expectedNet = consumer
            ? await suppliers.GetCachedNetRateAsync(request.OfferId, ct) ?? (decimal)request.ExpectedNetRate
            : (decimal)request.ExpectedNetRate;
        var result = await suppliers.RevalidateAsync(request.OfferId, expectedNet, ct);

        double sellPrice = 0;
        if (result.FailureReason is null)
        {
            var tier = await markups.ResolveTierAsync(caller, ct);
            var rule = await markups.ResolveRuleAsync(caller, tier, ProductTypes.Flight, ct);
            var snapshot = await snapshots.GetAsync(caller.TenantId, request.OfferId, ct);
            // Cached net/tax are in the supplier currency. Prefer SupplierCurrency; fall back to Currency for
            // snapshots written before P4-10 (where Currency was still the supplier's).
            var fromCurrency = !string.IsNullOrWhiteSpace(snapshot?.SupplierCurrency)
                ? snapshot!.SupplierCurrency
                : snapshot?.Currency ?? "USD";
            var (net, tax, currency) = await fx.ToSellCurrencyAsync(
                caller.TenantId, result.CurrentNetRate, result.CurrentTaxAmount, fromCurrency, ct);
            // Ignore request.Tenant.Currency — sell currency comes from the tenant (P4-10).
            var quote = pricing.Calculate(net, tier, rule, subAgentMarginOverride: null, currency, tax);
            sellPrice = (double)quote.FinalPrice;
        }

        var matches = result.Matches;
        if (consumer && matches && request.ExpectedSellPrice > 0 && Math.Round((decimal)request.ExpectedSellPrice, 2) != Math.Round((decimal)sellPrice, 2))
            matches = false;

        return new GrpcContract.RevalidateResponse
        {
            Matches = matches,
            CurrentNetRate = consumer ? 0 : (double)result.CurrentNetRate,
            FailureReason = result.FailureReason ?? string.Empty,
            CurrentSellPrice = sellPrice,
            ReplacementOfferId = result.ReplacementOfferId ?? string.Empty,
        };
    }

    private static bool IsConsumer(Caller caller) => caller.Channel == BookingChannels.B2C;
}
