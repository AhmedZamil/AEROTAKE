using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

[Collection(OtaCoreEngineCollection.Name)]
public class AgenciesControllerTests(OtaCoreEngineFixture fixture)
{
    private static object ValidCreateRequest(string? email = null) => new
    {
        displayName = "New Test Agency",
        email = email ?? $"{Guid.NewGuid():N}@test.example",
        tier = 3, // Gold
        creditLimit = 1000m,
    };

    // ---------------------------------------------------------------- Create

    [Fact]
    public async Task Create_AsAdmin_Returns201WithLocation()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/agencies", ValidCreateRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("isActive").GetBoolean());
        Assert.Equal(1000m, body.GetProperty("creditLimit").GetDecimal());
    }

    [Fact]
    public async Task Create_MissingDisplayName_Returns400()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/agencies",
            new { displayName = "", email = $"{Guid.NewGuid():N}@test.example", tier = 3, creditLimit = 0m });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_UndefinedTier_Returns400()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/agencies",
            new { displayName = "Bad Tier Agency", email = $"{Guid.NewGuid():N}@test.example", tier = 99, creditLimit = 0m });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_NegativeCreditLimit_Returns400()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/agencies",
            new { displayName = "Negative Credit Agency", email = $"{Guid.NewGuid():N}@test.example", tier = 3, creditLimit = -1m });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_DuplicateEmailInSameTenant_Returns409()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);
        var email = $"{Guid.NewGuid():N}@test.example";

        var first = await client.PostAsJsonAsync("/api/v1/agencies", ValidCreateRequest(email));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/v1/agencies", ValidCreateRequest(email));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Create_SameEmailInDifferentTenant_Returns201()
    {
        var (tenantAId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var (tenantBId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminAToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantAId);
        var adminBToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantBId);
        var email = $"{Guid.NewGuid():N}@test.example";

        var inTenantA = await fixture.Factory.CreateAuthenticatedClient(adminAToken).PostAsJsonAsync("/api/v1/agencies", ValidCreateRequest(email));
        Assert.Equal(HttpStatusCode.Created, inTenantA.StatusCode);

        var inTenantB = await fixture.Factory.CreateAuthenticatedClient(adminBToken).PostAsJsonAsync("/api/v1/agencies", ValidCreateRequest(email));
        Assert.Equal(HttpStatusCode.Created, inTenantB.StatusCode);
    }

    [Fact]
    public async Task Create_AsAgencyAdmin_Returns403()
    {
        var (_, _, token) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.PostAsJsonAsync("/api/v1/agencies", ValidCreateRequest());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_Unauthenticated_Returns401()
    {
        var client = fixture.Factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/agencies", ValidCreateRequest());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ------------------------------------------------------------------ List

    [Fact]
    public async Task List_OnlyReturnsAgenciesInCallersTenant()
    {
        var (tenantAId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var (tenantBId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminAToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantAId);
        var clientA = fixture.Factory.CreateAuthenticatedClient(adminAToken);

        var response = await clientA.GetAsync("/api/v1/agencies?pageSize=100");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        // Only the one agency seeded in tenant A (plus none from tenant B).
        Assert.Equal(1, body.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task List_FiltersByIsActive()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, isActive: true);
        // Different tier from the active agent above: SeedAgentAsync also seeds
        // a MarkupRule per (tenantId, tier), which is unique per tenant+tier.
        var (_, deactivatedAgentId, _) = await TestData.SeedAgentAsync(fixture.Factory, tenantId: tenantId, tier: Domain.AgentTier.Silver, isActive: false);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.GetAsync("/api/v1/agencies?isActive=false&pageSize=100");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        var items = body.GetProperty("items").EnumerateArray().ToList();
        Assert.All(items, i => Assert.False(i.GetProperty("isActive").GetBoolean()));
        Assert.Contains(items, i => i.GetProperty("id").GetGuid() == deactivatedAgentId);
    }

    [Fact]
    public async Task List_FiltersBySearch()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.GetAsync("/api/v1/agencies?search=nonexistent-search-term-xyz");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(0, body.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task List_RespectsPageSize()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.GetAsync("/api/v1/agencies?pageSize=1&page=1");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(body.GetProperty("items").GetArrayLength() <= 1);
        Assert.Equal(1, body.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task List_AsAgencyAdmin_Returns403()
    {
        var (_, _, token) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.GetAsync("/api/v1/agencies");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // -------------------------------------------------------------- GetById

    [Fact]
    public async Task GetById_ExistingAgency_Returns200()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.GetAsync($"/api/v1/agencies/{agentId}");

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(agentId, body.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task GetById_UnknownId_Returns404()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.GetAsync($"/api/v1/agencies/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------------------------------------------------------------- Update

    [Fact]
    public async Task Update_AsAdmin_PersistsChanges()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);
        var newEmail = $"{Guid.NewGuid():N}@test.example";

        var update = await client.PutAsJsonAsync($"/api/v1/agencies/{agentId}",
            new { displayName = "Renamed Agency", email = newEmail, tier = 2 });
        update.EnsureSuccessStatusCode();

        var reload = await client.GetAsync($"/api/v1/agencies/{agentId}");
        var body = await reload.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Renamed Agency", body.GetProperty("displayName").GetString());
        Assert.Equal(newEmail, body.GetProperty("email").GetString());
        Assert.Equal("Silver", body.GetProperty("tier").GetString());
    }

    [Fact]
    public async Task Update_UnknownId_Returns404()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PutAsJsonAsync($"/api/v1/agencies/{Guid.NewGuid()}",
            new { displayName = "Ghost Agency", email = $"{Guid.NewGuid():N}@test.example", tier = 1 });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Update_DuplicateEmailOfAnotherAgency_Returns409()
    {
        var (tenantId, firstAgentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var (secondAgentId, _) = await TestData.SeedAgentUserAsync(fixture.Factory, tenantId, Domain.UserRole.AgencyAdmin);
        var firstAgent = await TestData.ReloadAgentAsync(fixture.Factory, firstAgentId);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PutAsJsonAsync($"/api/v1/agencies/{secondAgentId}",
            new { displayName = "Colliding Agency", email = firstAgent.Email, tier = 2 });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Update_CannotSmuggleCreditLimitThroughExtraJsonProperty()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 500m);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var update = await client.PutAsJsonAsync($"/api/v1/agencies/{agentId}",
            new { displayName = "Still 500 Credit", email = $"{Guid.NewGuid():N}@test.example", tier = 3, creditLimit = 999999m });
        update.EnsureSuccessStatusCode();

        var reload = await client.GetAsync($"/api/v1/agencies/{agentId}");
        var body = await reload.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(500m, body.GetProperty("creditLimit").GetDecimal());
    }

    // ------------------------------------------------------- Activate/Deactivate

    [Fact]
    public async Task Deactivate_ThenActivate_TogglesState()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var deactivate = await client.PostAsync($"/api/v1/agencies/{agentId}/deactivate", null);
        deactivate.EnsureSuccessStatusCode();
        var deactivateBody = await deactivate.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(deactivateBody.GetProperty("isActive").GetBoolean());

        var activate = await client.PostAsync($"/api/v1/agencies/{agentId}/activate", null);
        activate.EnsureSuccessStatusCode();
        var activateBody = await activate.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(activateBody.GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Deactivate_CalledTwice_IsIdempotent()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var first = await client.PostAsync($"/api/v1/agencies/{agentId}/deactivate", null);
        var second = await client.PostAsync($"/api/v1/agencies/{agentId}/deactivate", null);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var body = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Deactivate_UnknownId_Returns404()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsync($"/api/v1/agencies/{Guid.NewGuid()}/deactivate", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Deactivate_AsAgencyAdmin_Returns403()
    {
        var (_, agentId, token) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.PostAsync($"/api/v1/agencies/{agentId}/deactivate", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
