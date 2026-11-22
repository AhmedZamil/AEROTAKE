using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Pricing;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P2-4: consumer (B2C) pricing is its own scheme — rules keyed by channel, with no tier — separate from the
/// agent (tier) rules, so changing one never moves the other.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class MarkupChannelTests(OtaCoreEngineFixture fixture)
{
    private async Task<MarkupRule> ResolveAsync(string tenantId, Caller caller, AgentTier tier, string productType = "Flight")
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        return await scope.ServiceProvider.GetRequiredService<IMarkupResolver>().ResolveRuleAsync(caller, tier, productType, default);
    }

    private async Task AddRuleAsync(string tenantId, string channel, AgentTier? tier, string product, decimal markup)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        db.MarkupRules.Add(new MarkupRule { TenantId = tenantId, Channel = channel, Tier = tier, ProductType = product, MarkupPercent = markup });
        await db.SaveChangesAsync();
    }

    private static Caller Consumer(string tenant) => new(tenant, "B2C", null, "service");
    private static Caller Agent(string tenant, Guid agent) => new(tenant, "B2B_AGENT", agent, "agent");

    // ---------------------------------------------------------------- resolution

    [Fact]
    public async Task AConsumerCaller_IsPricedByTheB2CRule_AnAgentByTheirTierRule_NeitherAffectsTheOther()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: AgentTier.Gold, markupPercent: 0.06m);
        await AddRuleAsync(tenantId, MarkupChannels.B2C, null, "*", 0.15m);

        var consumer = await ResolveAsync(tenantId, Consumer(tenantId), AgentTier.Standard);
        var agent = await ResolveAsync(tenantId, Agent(tenantId, agentId), AgentTier.Gold);

        Assert.Equal((MarkupChannels.B2C, null, 0.15m), (consumer.Channel, consumer.Tier, consumer.MarkupPercent));
        Assert.Equal((MarkupChannels.B2BAgent, (AgentTier?)AgentTier.Gold, 0.06m), (agent.Channel, agent.Tier, agent.MarkupPercent));
    }

    [Fact]
    public async Task AConsumerCaller_IgnoresAnyTier_ItHasNone()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: AgentTier.Platinum, seedConsumerRule: true);

        // whatever tier the resolver was handed, a consumer gets the B2C rule (a real loop: Assert.All would not await)
        foreach (var tier in new[] { AgentTier.Standard, AgentTier.Gold, AgentTier.Platinum })
            Assert.Equal(MarkupChannels.B2C, (await ResolveAsync(tenantId, Consumer(tenantId), tier)).Channel);
    }

    [Fact]
    public async Task AWhiteLabelCaller_TradingAsAnAgent_IsPricedByTheAgentTierRule()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: AgentTier.Gold, markupPercent: 0.06m, seedConsumerRule: true);
        var whiteLabel = new Caller(tenantId, "WHITE_LABEL", agentId, "service");

        var rule = await ResolveAsync(tenantId, whiteLabel, AgentTier.Gold);

        Assert.Equal(MarkupChannels.B2BAgent, rule.Channel);
    }

    [Fact]
    public async Task ATenantWithNoB2CRule_RefusesToPriceAConsumer_RatherThanFallingBackToAgentPricing()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: AgentTier.Standard); // an agent rule, no B2C rule

        var ex = await Assert.ThrowsAsync<ServiceException>(() => ResolveAsync(tenantId, Consumer(tenantId), AgentTier.Standard));

        Assert.Equal(ErrorKind.FailedPrecondition, ex.Kind);
        Assert.Contains("B2C", ex.Message);
        // ...while the agent in the same tenant is unaffected
        Assert.Equal(MarkupChannels.B2BAgent, (await ResolveAsync(tenantId, Agent(tenantId, agentId), AgentTier.Standard)).Channel);
    }

    [Fact]
    public async Task ASpecificProductRule_BeatsTheWildcard_ForEachScheme()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, seedConsumerRule: true);
        await AddRuleAsync(tenantId, MarkupChannels.B2C, null, "Flight", 0.20m);

        Assert.Equal(0.20m, (await ResolveAsync(tenantId, Consumer(tenantId), AgentTier.Standard, "Flight")).MarkupPercent);
        Assert.Equal("*", (await ResolveAsync(tenantId, Consumer(tenantId), AgentTier.Standard, "Hotel")).ProductType);
    }

    // ---------------------------------------------------------------- database rules

    private async Task<string?> RefusedByAsync(string tenantId, string channel, AgentTier? tier, string product = "Flight")
    {
        try { await AddRuleAsync(tenantId, channel, tier, product, 0.05m); return null; }
        catch (DbUpdateException ex) { return (ex.InnerException as Npgsql.PostgresException)?.ConstraintName; }
    }

    [Fact]
    public async Task TheDatabase_RefusesARuleWhoseTierDoesNotFitItsScheme()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal("CK_MarkupRules_ChannelTier", await RefusedByAsync(tenantId, MarkupChannels.B2C, AgentTier.Gold));     // consumer rule with a tier
        Assert.Equal("CK_MarkupRules_ChannelTier", await RefusedByAsync(tenantId, MarkupChannels.B2BAgent, null));           // agent rule without one
        Assert.Equal("CK_MarkupRules_ChannelTier", await RefusedByAsync(tenantId, "WHITE_LABEL", AgentTier.Gold));           // unknown scheme
    }

    [Fact]
    public async Task TheDatabase_RefusesTwoConsumerRulesForTheSameProduct_EvenThoughTheirTierIsNull()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        Assert.Null(await RefusedByAsync(tenantId, MarkupChannels.B2C, null, "Flight"));

        // NULL tiers must count as equal for uniqueness, or this second rule would slip through
        Assert.Equal("IX_MarkupRules_TenantId_Channel_Tier_ProductType", await RefusedByAsync(tenantId, MarkupChannels.B2C, null, "Flight"));
        Assert.Null(await RefusedByAsync(tenantId, MarkupChannels.B2C, null, "Hotel")); // another product is fine
    }

    [Fact]
    public async Task ARuleHasNoDatabaseDefaultForItsChannel()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();

        var defaults = await db.Database.SqlQueryRaw<string>(
            "SELECT column_default AS \"Value\" FROM information_schema.columns WHERE table_name = 'MarkupRules' AND column_name = 'Channel'").ToListAsync();

        Assert.Null(Assert.Single(defaults));
    }

    // ---------------------------------------------------------------- admin API

    private async Task<HttpClient> AdminAsync(string tenantId) =>
        fixture.Factory.CreateAuthenticatedClient(await TestData.SeedAdminUserAsync(fixture.Factory, tenantId));

    [Fact]
    public async Task AnAdmin_CanCreateAB2CRule_WithNoTier()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = await AdminAsync(tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", new { channel = "B2C", productType = "Flight", markupPercent = 0.12m, subAgentDefaultMargin = 0m });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("B2C", body.GetProperty("channel").GetString());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("tier").ValueKind);
    }

    [Fact]
    public async Task ACreateWithoutAChannel_StillMeansAnAgentRule_SoExistingClientsAreUnaffected()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = await AdminAsync(tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", new { tier = 1, productType = "Flight", markupPercent = 0.05m, subAgentDefaultMargin = 5m });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("B2B_AGENT", body.GetProperty("channel").GetString());
        Assert.Equal("Standard", body.GetProperty("tier").GetString());
    }

    [Theory]
    [InlineData("B2C", 1)]           // a consumer rule must not carry a tier
    [InlineData("B2B_AGENT", null)]  // an agent rule needs one
    [InlineData("NOPE", 1)]
    public async Task ARuleThatDoesNotFitItsScheme_IsA400(string channel, int? tier)
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = await AdminAsync(tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", new { channel, tier, productType = "Flight", markupPercent = 0.05m, subAgentDefaultMargin = 0m });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ADuplicateB2CRule_IsA409_AndABRuleAndAnAgentRuleMayShareAProduct()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = await AdminAsync(tenantId);
        var b2c = new { channel = "B2C", productType = "Hotel", markupPercent = 0.1m, subAgentDefaultMargin = 0m };
        var agent = new { tier = 1, productType = "Hotel", markupPercent = 0.1m, subAgentDefaultMargin = 0m };

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/markup-rules", b2c)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/markup-rules", b2c)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/markup-rules", agent)).StatusCode); // same product, other scheme
    }

    [Fact]
    public async Task TheList_CanBeFilteredByChannel()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, seedConsumerRule: true);
        var client = await AdminAsync(tenantId);

        var b2c = await (await client.GetAsync("/api/v1/markup-rules?channel=B2C")).Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(1, b2c.GetProperty("totalCount").GetInt32());
        Assert.Equal("B2C", b2c.GetProperty("items")[0].GetProperty("channel").GetString());
    }

    [Fact]
    public async Task ARulesChannel_CannotBeChangedByAnUpdate()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, seedConsumerRule: true);
        var client = await AdminAsync(tenantId);
        var rule = (await (await client.GetAsync("/api/v1/markup-rules?channel=B2C")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items")[0];
        var id = rule.GetProperty("id").GetGuid();

        var toAgent = await client.PutAsJsonAsync($"/api/v1/markup-rules/{id}", new { channel = "B2B_AGENT", tier = 1, productType = "*", markupPercent = 0.1m, subAgentDefaultMargin = 0m });
        var sameChannel = await client.PutAsJsonAsync($"/api/v1/markup-rules/{id}", new { productType = "*", markupPercent = 0.11m, subAgentDefaultMargin = 0m });

        Assert.Equal(HttpStatusCode.BadRequest, toAgent.StatusCode);
        Assert.Equal(HttpStatusCode.OK, sameChannel.StatusCode);
    }
}
