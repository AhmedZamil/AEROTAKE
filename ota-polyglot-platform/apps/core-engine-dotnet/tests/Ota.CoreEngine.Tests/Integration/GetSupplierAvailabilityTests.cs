using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

[Collection(OtaCoreEngineCollection.Name)]
public class GetSupplierAvailabilityTests(OtaCoreEngineFixture fixture)
{
    private static SearchRequest Search(string tenantId, string checkIn) => new()
    {
        Tenant = new TenantContext { TenantId = tenantId, Channel = ChannelType.B2BAgent, AgentTier = AgentTier.Gold, Currency = "USD" },
        ProductType = ProductType.Flight,
        Origin = "DAC",
        Destination = "NRT",
        CheckIn = checkIn,
        CheckOut = DateOnly.Parse(checkIn).AddDays(3).ToString("yyyy-MM-dd"),
        Adults = 1,
    };

    private static string FreshDay() =>
        DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1200 + Random.Shared.Next(4000)).ToString("yyyy-MM-dd");

    [Fact]
    public async Task GetSupplierAvailability_SecondIdenticalSearch_IsCacheHit()
    {
        var (tenantId, _, token) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(token));
        var request = Search(tenantId, FreshDay());

        var first = await client.GetSupplierAvailabilityAsync(request);
        var second = await client.GetSupplierAvailabilityAsync(request);

        Assert.False(first.CacheHit);
        Assert.True(second.CacheHit);
        Assert.Equal(first.SearchId, second.SearchId);
    }

    [Fact]
    public async Task GetSupplierAvailability_TwoTenantsShareTheAirlineList_AndEachKeepsItsOwnMarkup()
    {
        var (tenantA, _, tokenA) = await TestData.SeedAgentAsync(fixture.Factory, markupPercent: 0.06m, subAgentDefaultMargin: 10m);
        var (tenantB, _, tokenB) = await TestData.SeedAgentAsync(fixture.Factory, markupPercent: 0.20m, subAgentDefaultMargin: 0m);
        var clientA = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(tokenA));
        var clientB = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(tokenB));
        var day = FreshDay();

        var forTenantA = await clientA.GetSupplierAvailabilityAsync(Search(tenantA, day));
        var forTenantB = await clientB.GetSupplierAvailabilityAsync(Search(tenantB, day));

        Assert.False(forTenantA.CacheHit);
        Assert.True(forTenantB.CacheHit);
        Assert.Equal(forTenantA.SearchId, forTenantB.SearchId);
        Assert.Equal(forTenantA.Offers.Select(o => o.OfferId), forTenantB.Offers.Select(o => o.OfferId));
        Assert.NotEqual(forTenantA.Offers.Select(o => o.SellPrice), forTenantB.Offers.Select(o => o.SellPrice));
    }
}
