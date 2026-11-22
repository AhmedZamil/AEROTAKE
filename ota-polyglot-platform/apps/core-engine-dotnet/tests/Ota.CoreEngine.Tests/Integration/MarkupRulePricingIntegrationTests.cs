using System.Net.Http.Json;
using System.Text.Json;
using Grpc.Core;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>
/// C2: proves the new MarkupRulesController admin surface actually drives live
/// pricing/booking behavior through ResolveMarkupRuleAsync/PricingCalculator —
/// not just that rows can be written to the database. Reuses
/// ProcessB2BBookingTests.cs's gRPC-client pattern.
/// </summary>
[Collection(OtaCoreEngineCollection.Name)]
public class MarkupRulePricingIntegrationTests(OtaCoreEngineFixture fixture)
{
    private static B2BBookingRequest BookingRequest(string tenantId, Guid agentId, string offerId, string idempotencyKey) => new()
    {
        Tenant = new TenantContext
        {
            TenantId = tenantId,
            Channel = ChannelType.B2BAgent,
            AgentId = agentId.ToString(),
            AgentTier = AgentTier.Gold,
            Currency = "USD",
        },
        OfferId = offerId,
        IdempotencyKey = idempotencyKey,
        ContactEmail = "ops@test.example",
        Travelers = { new Traveler { FirstName = "Test", LastName = "Traveler", DocumentType = "PASSPORT", DocumentNumber = "P0000000" } },
    };

    [Fact]
    public async Task UpdatedMarkupRule_ChangesFinalPriceOnNextBooking()
    {
        // SeedAgentAsync seeds one wildcard ("*") MarkupRule for this agent's tier.
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m, tier: Domain.AgentTier.Gold);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var httpClient = fixture.Factory.CreateAuthenticatedClient(adminToken);
        var grpcClient = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        var listResponse = await httpClient.GetAsync("/api/v1/markup-rules?tier=3&productType=*"); // AgentTier.Gold = 3
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ruleId = listBody.GetProperty("items")[0].GetProperty("id").GetGuid();

        // New markup: 20% + $50 sub-agent margin.
        var update = await httpClient.PutAsJsonAsync($"/api/v1/markup-rules/{ruleId}",
            new { tier = 3, productType = "*", markupPercent = 0.20m, subAgentDefaultMargin = 50m });
        update.EnsureSuccessStatusCode();

        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-pricing-update");
        var response = await grpcClient.ProcessB2BBookingAsync(
            BookingRequest(tenantId, agentId, "AMADEUS-pricing-update", $"key-{Guid.NewGuid()}"));

        // SupplierStub.NetRateForOffer("AMADEUS-...") = 220; 220 * 1.20 + 50 = 314.00
        Assert.Equal(314.00, response.Price.FinalPrice, precision: 2);
    }

    [Fact]
    public async Task DeactivatedMarkupRule_CausesBookingToFailWithFailedPrecondition()
    {
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m, tier: Domain.AgentTier.Gold);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var httpClient = fixture.Factory.CreateAuthenticatedClient(adminToken);
        var grpcClient = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        var listResponse = await httpClient.GetAsync("/api/v1/markup-rules?tier=3&productType=*");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ruleId = listBody.GetProperty("items")[0].GetProperty("id").GetGuid();

        var deactivate = await httpClient.PostAsync($"/api/v1/markup-rules/{ruleId}/deactivate", null);
        deactivate.EnsureSuccessStatusCode();

        var ex = await Assert.ThrowsAsync<RpcException>(() =>
            grpcClient.ProcessB2BBookingAsync(BookingRequest(tenantId, agentId, "AMADEUS-deactivated-rule", $"key-{Guid.NewGuid()}")).ResponseAsync);

        Assert.Equal(StatusCode.FailedPrecondition, ex.StatusCode);
    }

    [Fact]
    public async Task CreatedMarkupRuleForSpecificProductType_TakesPrecedenceOverWildcard()
    {
        // ProcessB2BBooking always resolves with ProductType="*" (hardcoded in
        // OtaCoreGrpcService.cs) — it can never exercise product-type
        // precedence. GetSupplierAvailability is the RPC that actually passes
        // the caller's real ProductType through to ResolveMarkupRuleAsync, so
        // it's the one that can prove "specific beats wildcard".
        var (tenantId, _, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Gold, markupPercent: 0.06m, subAgentDefaultMargin: 10m);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var httpClient = fixture.Factory.CreateAuthenticatedClient(adminToken);
        var grpcClient = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        // Wildcard rule (0.06 / 10) already exists from SeedAgentAsync; add a
        // deliberately very different Flight-specific rule so a wrong-rule
        // result is unmistakable.
        var create = await httpClient.PostAsJsonAsync("/api/v1/markup-rules",
            new { tier = 3, productType = "Flight", markupPercent = 0.50m, subAgentDefaultMargin = 100m });
        create.EnsureSuccessStatusCode();

        var search = await grpcClient.GetSupplierAvailabilityAsync(new SearchRequest
        {
            Tenant = new TenantContext { TenantId = tenantId, Channel = ChannelType.B2BAgent, AgentTier = AgentTier.Gold, Currency = "USD" },
            ProductType = ProductType.Flight,
            Origin = "DAC",
            Destination = "NRT",
            CheckIn = "2026-09-10",
            CheckOut = "2026-09-13",
            Adults = 1,
        });

        var offer = search.Offers[0];
        // Compute the expected sell price from the response's OWN returned net
        // rate (the stub's seed is per-process, not a fixed constant) rather
        // than guessing it — this proves the *specific* rule's markup (0.50/100)
        // was applied, not the wildcard's (0.06/10): the two would only agree
        // by coincidence.
        var expected = Math.Round((decimal)offer.NetRate * 1.50m + 100m, 2, MidpointRounding.AwayFromZero);
        Assert.Equal((double)expected, offer.SellPrice, precision: 2);
    }
}
