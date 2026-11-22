using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>
/// The fare an agent SEES (search, revalidate) must equal the fare they are
/// BOOKED at. Booking prices with the agent's stored tier, so search and
/// revalidate must too — regardless of the tier the caller claims.
/// </summary>
[Collection(OtaCoreEngineCollection.Name)]
public class AgentTierPricingConsistencyTests(OtaCoreEngineFixture fixture)
{
    private static TenantContext Tenant(string tenantId, Guid? agentId, AgentTier claimedTier) => new()
    {
        TenantId = tenantId,
        Channel = ChannelType.B2BAgent,
        AgentId = agentId?.ToString() ?? "",
        AgentTier = claimedTier,
        Currency = "USD",
    };

    [Fact]
    public async Task Search_prices_with_the_agents_stored_tier_even_when_the_caller_claims_a_different_one()
    {
        // Gold agent: 6% + 10 margin (TestData defaults). The caller lies and says Standard.
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Gold, markupPercent: 0.06m, subAgentDefaultMargin: 10m);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        var response = await client.GetSupplierAvailabilityAsync(new SearchRequest
        {
            Tenant = Tenant(tenantId, agentId, AgentTier.Standard),
            ProductType = ProductType.Flight, Origin = "DAC", Destination = "CXB", CheckIn = "2026-10-25", Adults = 1,
        });

        Assert.NotEmpty(response.Offers);
        Assert.All(response.Offers, o => Assert.Equal(o.NetRate * 1.06 + 10, o.SellPrice, precision: 2));
    }

    [Fact]
    public async Task Revalidate_and_booking_quote_the_same_price_search_showed()
    {
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Gold, creditLimit: 5000m, markupPercent: 0.06m, subAgentDefaultMargin: 10m);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));
        var tenant = Tenant(tenantId, agentId, AgentTier.Standard); // wrong claim on purpose

        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-consistency");
        var reval = await client.RevalidateOfferAsync(new RevalidateRequest { Tenant = tenant, OfferId = "AMADEUS-consistency", ExpectedNetRate = 220 });
        var booking = await client.ProcessB2BBookingAsync(new B2BBookingRequest
        {
            Tenant = tenant, OfferId = "AMADEUS-consistency", IdempotencyKey = $"key-{Guid.NewGuid()}", ContactEmail = "ops@test.example",
            Travelers = { new Traveler { FirstName = "T", LastName = "T", DocumentType = "PASSPORT", DocumentNumber = "P0000000" } },
        });

        Assert.Equal(220 * 1.06 + 10, reval.CurrentSellPrice, precision: 2);
        Assert.Equal(reval.CurrentSellPrice, booking.Price.FinalPrice, precision: 2);
    }

    [Fact]
    public async Task An_anonymous_search_with_no_agent_still_uses_the_claimed_tier()
    {
        var (tenantId, _, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Gold, markupPercent: 0.06m, subAgentDefaultMargin: 10m);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        var response = await client.GetSupplierAvailabilityAsync(new SearchRequest
        {
            Tenant = Tenant(tenantId, null, AgentTier.Gold),
            ProductType = ProductType.Flight, Origin = "DAC", Destination = "CXB", CheckIn = "2026-10-25", Adults = 1,
        });

        Assert.All(response.Offers, o => Assert.Equal(o.NetRate * 1.06 + 10, o.SellPrice, precision: 2));
    }
}
