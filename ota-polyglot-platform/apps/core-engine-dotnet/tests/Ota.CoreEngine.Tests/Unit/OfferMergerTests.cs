using Xunit;
using Ota.CoreEngine.Suppliers;

namespace Ota.CoreEngine.Tests.Unit;

public class OfferMergerTests
{
    public static SupplierOfferResult Offer(string id, string supplier, decimal net, string flight = "BS141", string depLocal = "2026-10-25T07:15:00",
        bool bag = true, double kg = 20, int leg = 0, decimal tax = 0)
    {
        var dep = DateTimeOffset.Parse(depLocal + "Z");
        return new SupplierOfferResult(id, supplier, net, "t", "BDT",
            [new FlightSegmentResult(flight[..2], flight[2..], "DAC", "CXB", dep, dep.AddHours(1), "Y", leg, depLocal, depLocal)],
            bag, kg, tax);
    }

    [Fact]
    public void Same_flight_from_two_suppliers_keeps_only_the_cheapest_and_records_the_loser()
    {
        var sabre = Offer("SABRE-1", "SABRE", 3224);
        var hajee = Offer("HAJEE-1", "HAJEE", 3000);

        var merged = OfferMerger.Merge([sabre, hajee], o => o.NetRate);

        Assert.Equal(["HAJEE-1"], merged.Offers.Select(o => o.OfferId));
        Assert.Equal(["SABRE-1"], merged.Alternates["HAJEE-1"]);
    }

    [Fact]
    public void Ties_go_to_the_supplier_that_answered_first()
    {
        var merged = OfferMerger.Merge([Offer("SABRE-1", "SABRE", 3000), Offer("HAJEE-1", "HAJEE", 3000)], o => o.NetRate);
        Assert.Equal("SABRE-1", Assert.Single(merged.Offers).OfferId);
    }

    [Fact]
    public void Price_comparison_uses_the_caller_supplied_final_price_not_raw_net()
    {
        // Higher net but far lower tax => cheaper for the agent overall.
        var a = Offer("SABRE-1", "SABRE", 3000, tax: 2000);
        var b = Offer("HAJEE-1", "HAJEE", 3500, tax: 100);
        var merged = OfferMerger.Merge([a, b], o => o.NetRate + o.TaxAmount);
        Assert.Equal("HAJEE-1", Assert.Single(merged.Offers).OfferId);
    }

    [Fact]
    public void Different_flights_times_or_baggage_are_never_merged()
    {
        var offers = new[]
        {
            Offer("SABRE-1", "SABRE", 3000),
            Offer("HAJEE-1", "HAJEE", 2900, flight: "BS143"),                      // other flight number
            Offer("HAJEE-2", "HAJEE", 2900, depLocal: "2026-10-25T09:50:00"),     // other departure time
            Offer("HAJEE-3", "HAJEE", 2900, bag: false, kg: 0),                    // cheaper but no bag: not identical
        };
        var merged = OfferMerger.Merge(offers, o => o.NetRate);
        Assert.Equal(4, merged.Offers.Count);
        Assert.Empty(merged.Alternates);
    }

    [Fact]
    public void Round_trip_legs_are_part_of_the_key()
    {
        static SupplierOfferResult RoundTrip(string id, string returnDep)
        {
            var o = Offer(id, "SABRE", 5000);
            var back = Offer(id, "SABRE", 5000, flight: "BS142", depLocal: returnDep, leg: 1).Segments![0];
            return o with { Segments = [o.Segments![0], back] };
        }
        var merged = OfferMerger.Merge([RoundTrip("SABRE-1", "2026-10-30T10:00:00"), RoundTrip("SABRE-2", "2026-10-30T18:00:00")], o => o.NetRate);
        Assert.Equal(2, merged.Offers.Count);
    }

    [Fact]
    public void Offers_without_segments_are_never_merged()
    {
        var a = new SupplierOfferResult("X-1", "X", 1, "t", "BDT");
        var b = new SupplierOfferResult("X-2", "X", 2, "t", "BDT");
        Assert.Equal(2, OfferMerger.Merge([a, b], o => o.NetRate).Offers.Count);
    }

    [Fact]
    public void Three_way_duplicate_orders_alternates_cheapest_first()
    {
        var merged = OfferMerger.Merge(
            [Offer("A-1", "A", 300), Offer("B-1", "B", 100), Offer("C-1", "C", 200)], o => o.NetRate);
        Assert.Equal(["C-1", "A-1"], merged.Alternates["B-1"]);
    }
}

public class SabreFareCurrencyTests
{
    [Fact]
    public void The_offer_is_labelled_with_the_currency_Sabre_priced_it_in_not_the_requests_default()
    {
        var fare = System.Text.Json.Nodes.JsonNode.Parse("""{"totalPrice":56552,"totalTaxAmount":12038,"currency":"BDT","baseFareAmount":360,"baseFareCurrency":"USD","equivalentAmount":44514,"equivalentCurrency":"BDT"}""")!;

        Assert.Equal("BDT", Ota.CoreEngine.Suppliers.SabreProvider.SaleCurrency(fare, "USD"));
    }

    [Fact]
    public void A_response_that_names_no_currency_keeps_the_fallback()
    {
        var fare = System.Text.Json.Nodes.JsonNode.Parse("""{"totalPrice":4552,"totalTaxAmount":1300,"baseFareAmount":3224}""")!;

        Assert.Equal("USD", Ota.CoreEngine.Suppliers.SabreProvider.SaleCurrency(fare, "USD"));
    }

    [Fact]
    public void International_fares_use_the_sale_currency_equivalent_not_the_USD_construction_amount()
    {
        // Real Sabre cert response for DAC>JED: base 360 USD == 44,514 BDT.
        var fare = System.Text.Json.Nodes.JsonNode.Parse("""{"totalPrice":56552,"totalTaxAmount":12038,"currency":"BDT","baseFareAmount":360,"baseFareCurrency":"USD","equivalentAmount":44514,"equivalentCurrency":"BDT"}""")!;
        Assert.Equal(44514m, Ota.CoreEngine.Suppliers.SabreProvider.BaseFareInSaleCurrency(fare));
    }

    [Fact]
    public void Domestic_fares_without_an_equivalent_amount_keep_using_the_base_fare()
    {
        var fare = System.Text.Json.Nodes.JsonNode.Parse("""{"totalPrice":4552,"totalTaxAmount":1300,"currency":"BDT","baseFareAmount":3224}""")!;
        Assert.Equal(3224m, Ota.CoreEngine.Suppliers.SabreProvider.BaseFareInSaleCurrency(fare));
    }
}
