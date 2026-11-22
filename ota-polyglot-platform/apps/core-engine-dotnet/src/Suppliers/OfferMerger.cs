using System.Globalization;
using StackExchange.Redis;

namespace Ota.CoreEngine.Suppliers;

/// <summary>Result of collapsing duplicate itineraries across suppliers.
/// Alternates maps a winning offer id to the losing offers for the same
/// itinerary, cheapest first — kept so a failed reprice of the winner can
/// fall back to the other supplier instead of failing the booking.</summary>
public sealed record MergedOffers(
    IReadOnlyList<SupplierOfferResult> Offers,
    IReadOnlyDictionary<string, IReadOnlyList<string>> Alternates);

/// <summary>
/// "Same flight" detection + cheapest-wins merge for a multi-supplier search.
/// Two offers are the same itinerary when, leg by leg, every segment has the
/// same marketing airline, flight number and LOCAL departure minute at the
/// origin airport (local time is what every supplier reports; UTC instants
/// aren't comparable because some suppliers have no timezone data) and the
/// same checked-baggage allowance — so a cheaper fare that drops the bag
/// stays a separate offer instead of silently replacing the fuller one.
/// </summary>
public static class OfferMerger
{
    public static string ItineraryKey(SupplierOfferResult offer)
    {
        if (offer.Segments is not { Count: > 0 } segments) return $"noseg:{offer.OfferId}"; // never merge what we can't identify

        var legs = segments
            .GroupBy(s => s.LegIndex)
            .OrderBy(g => g.Key)
            .Select(g => string.Join(">", g.Select(s => $"{s.AirlineCode}{s.FlightNumber}@{LocalMinute(s.DepartureTimeLocal)}")));

        return string.Join("|", legs) + $"#bag={offer.CheckedBaggageWeightKg.ToString("0", CultureInfo.InvariantCulture)}{(offer.CheckedBaggageIncluded ? "y" : "n")}";
    }

    private static string LocalMinute(string local) => local.Length >= 16 ? local[..16] : local;

    public static MergedOffers Merge(IReadOnlyList<SupplierOfferResult> offers, Func<SupplierOfferResult, decimal> finalPrice)
    {
        var winners = new List<SupplierOfferResult>();
        var alternates = new Dictionary<string, IReadOnlyList<string>>();

        // GroupBy preserves first-seen group order, so the output keeps the
        // providers' relative ordering; within a group the cheapest wins and
        // ties go to whichever supplier answered first (stable sort).
        foreach (var group in offers.GroupBy(ItineraryKey))
        {
            var ranked = group.OrderBy(finalPrice).ToList();
            winners.Add(ranked[0]);
            if (ranked.Count > 1)
                alternates[ranked[0].OfferId] = ranked.Skip(1).Select(o => o.OfferId).ToList();
        }

        return new MergedOffers(winners, alternates);
    }
}

public static class OfferAlternates
{
    public static string Key(string winnerOfferId) => $"offer-alt:{winnerOfferId}";
}

/// <summary>Reads back the alternates recorded at search time. An interface
/// (rather than Redis directly) so the composite's fallback is unit-testable.</summary>
public interface IOfferAlternatesReader
{
    Task<IReadOnlyList<string>> GetAsync(string winnerOfferId);
}

public sealed class RedisOfferAlternatesReader(IConnectionMultiplexer redis) : IOfferAlternatesReader
{
    public async Task<IReadOnlyList<string>> GetAsync(string winnerOfferId) =>
        (await redis.GetDatabase().ListRangeAsync(OfferAlternates.Key(winnerOfferId))).Select(v => v.ToString()).ToList();
}
