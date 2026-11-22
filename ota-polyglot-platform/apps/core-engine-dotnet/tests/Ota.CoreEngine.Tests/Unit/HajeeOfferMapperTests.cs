using Xunit;
using System.Text.Json.Nodes;
using Ota.CoreEngine.Suppliers;

namespace Ota.CoreEngine.Tests.Unit;

/// <summary>Runs the mapper against REAL Hajee staging responses captured in
/// apis-doc/samples (search trimmed to 6 offers, plus one reprice).</summary>
public class HajeeOfferMapperTests
{
    private static JsonNode Load(string file) =>
        JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "hajee", file)))!;

    private static JsonArray SearchItems() => (JsonArray)Load("hajee-search-DAC-JED.trimmed.json")["payload"]!["pricedItineraries"]!;

    [Fact]
    public void Pricing_splits_into_net_and_tax_that_sum_to_what_Hajee_bills()
    {
        // Verified on staging: userPayable = totalFare - commission + AIT + ticketing charge.
        foreach (var item in SearchItems())
        {
            var offer = item!["flightOffer"]!;
            var price = offer["pricingInfo"]!["price"]!;
            var (net, tax, currency) = HajeeOfferMapper.ExtractPricing(offer)!.Value;

            Assert.Equal(HajeeOfferMapper.Num(price["userPayable"]), net + tax);
            Assert.Equal(HajeeOfferMapper.Num(price["taxes"]) + HajeeOfferMapper.Num(price["ait"]) + HajeeOfferMapper.Num(price["ticketingCharge"]), tax);
            Assert.Equal("BDT", currency);
        }
    }

    [Fact]
    public void First_offer_matches_the_numbers_checked_by_hand()
    {
        // EY383+EY603 DAC>AUH>JED: base 44514, taxes 12038, commission 3216, AIT 170, ticketing 100
        var (net, tax, _) = HajeeOfferMapper.ExtractPricing(SearchItems()[0]!["flightOffer"])!.Value;
        Assert.Equal(12308m, tax);   // 12038 + 170 + 100
        Assert.Equal(41298m, net);   // 53606 - 12308
    }

    [Fact]
    public void Connection_gets_a_true_layover_and_correct_total_travel_time()
    {
        var offer = HajeeOfferMapper.MapOffer(SearchItems()[0], "HAJEE-test")!;

        Assert.Equal(2, offer.Segments!.Count);
        Assert.Equal("EY", offer.Segments[0].AirlineCode);
        Assert.Equal("383", offer.Segments[0].FlightNumber);
        Assert.Equal("2026-10-25T21:35:00", offer.Segments[0].DepartureTimeLocal);
        Assert.Equal("2026-10-26T04:35:00", offer.Segments[1].ArrivalTimeLocal);

        // 310 min + 105 min layover at AUH + 185 min = 600 min door to door
        // (matches the real DAC 21:35 UTC+6 -> JED 04:35 UTC+3 clock difference).
        var total = offer.Segments[^1].ArrivalTime - offer.Segments[0].DepartureTime;
        Assert.Equal(600, total.TotalMinutes);
        Assert.Equal(105, (offer.Segments[1].DepartureTime - offer.Segments[0].ArrivalTime).TotalMinutes);
    }

    [Fact]
    public void Baggage_is_read_from_the_first_checked_bag_allowance()
    {
        var items = SearchItems();
        var basic = HajeeOfferMapper.MapOffer(items[0], "HAJEE-a")!;   // EY economy basic: 0 kg
        var flydubai = HajeeOfferMapper.MapOffer(items[2], "HAJEE-b")!; // FZ: 30 kg

        Assert.False(basic.CheckedBaggageIncluded);
        Assert.True(flydubai.CheckedBaggageIncluded);
        Assert.Equal(30, flydubai.CheckedBaggageWeightKg);
        Assert.Equal("DAC → JED (FZ)", flydubai.Title);
        Assert.Equal("HAJEE", flydubai.SupplierCode);
    }

    [Fact]
    public void An_offer_without_a_payable_amount_is_dropped_rather_than_priced_at_zero()
    {
        var broken = JsonNode.Parse(SearchItems()[0]!.ToJsonString())!;
        broken["flightOffer"]!["pricingInfo"]!["price"]!["userPayable"] = 0;
        Assert.Null(HajeeOfferMapper.MapOffer(broken, "HAJEE-x"));
    }

    [Fact]
    public void Reprice_response_parses_price_changed_and_pricing()
    {
        var (flightOffer, priceChanged, _) = HajeeOfferMapper.ParseReprice(Load("hajee-reprice.json")["payload"]);
        var pricing = HajeeOfferMapper.ExtractPricing(flightOffer)!.Value;

        Assert.False(priceChanged);
        Assert.Equal(54942m, pricing.Net + pricing.Tax); // FZ offer's userPayable
    }

    [Theory]
    [InlineData("1700000000", "1700000000")]
    [InlineData("01700000000", "1700000000")]
    [InlineData("+8801700000000", "1700000000")]
    [InlineData("8801700000000", "1700000000")]
    [InlineData("017-0000 0000", "1700000000")]
    public void Phone_is_reduced_to_the_local_number_for_phoneCode_plus_880(string input, string expected) =>
        Assert.Equal(expected, HajeeAirProvider.LocalPhoneNumber(input));
}
