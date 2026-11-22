using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

[Collection(OtaCoreEngineCollection.Name)]
public class AgentTierProfilesControllerTests(OtaCoreEngineFixture fixture)
{
    private static object ValidCreateRequest(int tier = 1) => new { tier, name = "Test Tier", description = (string?)null, isDefault = false };

    // ---------------------------------------------------------------- Create

    [Fact]
    public async Task Create_AsAdmin_Returns201()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest(tier: 1));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Standard", body.GetProperty("tier").GetString());
        Assert.True(body.GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Create_UndefinedTier_Returns400()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/agent-tiers", new { tier = 99, name = "Bad Tier" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_DuplicateTierForSameTenant_Returns409()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var first = await client.PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest(tier: 2));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest(tier: 2));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Create_SameTierDifferentTenant_Returns201()
    {
        var (tenantAId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var (tenantBId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminAToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantAId);
        var adminBToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantBId);

        var inA = await fixture.Factory.CreateAuthenticatedClient(adminAToken).PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest(tier: 3));
        Assert.Equal(HttpStatusCode.Created, inA.StatusCode);

        var inB = await fixture.Factory.CreateAuthenticatedClient(adminBToken).PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest(tier: 3));
        Assert.Equal(HttpStatusCode.Created, inB.StatusCode);
    }

    [Fact]
    public async Task Create_AsAgencyAdmin_Returns403()
    {
        var (_, _, token) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_Unauthenticated_Returns401()
    {
        var client = fixture.Factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_WithIsDefaultTrue_UnsetsPreviousDefault()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var first = await client.PostAsJsonAsync("/api/v1/agent-tiers", new { tier = 1, name = "Standard", isDefault = true });
        first.EnsureSuccessStatusCode();
        var firstId = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var second = await client.PostAsJsonAsync("/api/v1/agent-tiers", new { tier = 2, name = "Silver", isDefault = true });
        second.EnsureSuccessStatusCode();

        var reloadFirst = await client.GetAsync($"/api/v1/agent-tiers/{firstId}");
        var firstBody = await reloadFirst.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(firstBody.GetProperty("isDefault").GetBoolean());

        var secondBody = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(secondBody.GetProperty("isDefault").GetBoolean());
    }

    // ------------------------------------------------------------------ List

    [Fact]
    public async Task List_OnlyReturnsProfilesInCallersTenant()
    {
        var (tenantAId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var (tenantBId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminAToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantAId);
        var clientA = fixture.Factory.CreateAuthenticatedClient(adminAToken);
        await clientA.PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest(tier: 1));

        var adminBToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantBId);
        await fixture.Factory.CreateAuthenticatedClient(adminBToken).PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest(tier: 1));

        var response = await clientA.GetAsync("/api/v1/agent-tiers");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(1, body.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task List_OrderedByTierRank()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        // Create out of order: Gold(3), then Standard(1), then Silver(2).
        await client.PostAsJsonAsync("/api/v1/agent-tiers", new { tier = 3, name = "Gold" });
        await client.PostAsJsonAsync("/api/v1/agent-tiers", new { tier = 1, name = "Standard" });
        await client.PostAsJsonAsync("/api/v1/agent-tiers", new { tier = 2, name = "Silver" });

        var response = await client.GetAsync("/api/v1/agent-tiers");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var tiers = body.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("tier").GetString()).ToList();

        Assert.Equal(new[] { "Standard", "Silver", "Gold" }, tiers);
    }

    // -------------------------------------------------------------- GetById

    [Fact]
    public async Task GetById_UnknownId_Returns404()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.GetAsync($"/api/v1/agent-tiers/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------- Update

    [Fact]
    public async Task Update_ChangingIsDefaultToTrue_UnsetsPreviousDefault()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var first = await client.PostAsJsonAsync("/api/v1/agent-tiers", new { tier = 1, name = "Standard", isDefault = true });
        var firstId = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var second = await client.PostAsJsonAsync("/api/v1/agent-tiers", new { tier = 2, name = "Silver", isDefault = false });
        var secondId = (await second.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var update = await client.PutAsJsonAsync($"/api/v1/agent-tiers/{secondId}",
            new { name = "Silver", description = (string?)null, isDefault = true, isActive = true });
        update.EnsureSuccessStatusCode();

        var reloadFirst = await client.GetAsync($"/api/v1/agent-tiers/{firstId}");
        var firstBody = await reloadFirst.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(firstBody.GetProperty("isDefault").GetBoolean());

        var updateBody = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(updateBody.GetProperty("isDefault").GetBoolean());
    }

    [Fact]
    public async Task Update_SetIsActiveFalse_PersistsWithoutSeparateEndpoint()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var create = await client.PostAsJsonAsync("/api/v1/agent-tiers", ValidCreateRequest(tier: 4));
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var update = await client.PutAsJsonAsync($"/api/v1/agent-tiers/{id}",
            new { name = "Test Tier", description = (string?)null, isDefault = false, isActive = false });
        update.EnsureSuccessStatusCode();

        var body = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("isActive").GetBoolean());
    }
}
