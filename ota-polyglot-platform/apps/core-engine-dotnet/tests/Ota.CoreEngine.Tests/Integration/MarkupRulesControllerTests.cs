using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

[Collection(OtaCoreEngineCollection.Name)]
public class MarkupRulesControllerTests(OtaCoreEngineFixture fixture)
{
    // tier=1 (Standard), productType="Flight" — avoids colliding with the
    // wildcard "*" rule TestData.SeedAgentAsync already seeds for its tier.
    private static object ValidCreateRequest(int tier = 1, string productType = "Flight", decimal markupPercent = 0.05m, decimal subAgentDefaultMargin = 5m) =>
        new { tier, productType, markupPercent, subAgentDefaultMargin };

    // ---------------------------------------------------------------- Create

    [Fact]
    public async Task Create_AsAdmin_Returns201()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Standard", body.GetProperty("tier").GetString());
        Assert.Equal("Flight", body.GetProperty("productType").GetString());
        Assert.True(body.GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Create_MarkupPercentAboveOne_Returns400()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(markupPercent: 1.01m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_MarkupPercentNegative_Returns400()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(markupPercent: -0.01m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_MarkupPercentAtBoundaries_Succeeds()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var zero = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "Hotel", markupPercent: 0m));
        Assert.Equal(HttpStatusCode.Created, zero.StatusCode);

        var one = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "Package", markupPercent: 1m));
        Assert.Equal(HttpStatusCode.Created, one.StatusCode);
    }

    [Fact]
    public async Task Create_NegativeSubAgentMargin_Returns400()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(subAgentDefaultMargin: -1m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_InvalidProductType_UsingProtoWireName_Returns400()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        // "PRODUCT_TYPE_FLIGHT" is the proto's WIRE name, not the C# generated
        // enum member name ("Flight") the resolver actually compares against —
        // this is the exact mistake the validator must catch.
        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "PRODUCT_TYPE_FLIGHT"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("Unspecified")]
    [InlineData("Flight")]
    [InlineData("Hotel")]
    [InlineData("Package")]
    [InlineData("Activity")]
    [InlineData("*")]
    public async Task Create_AllSixValidProductTypes_Succeed(string productType)
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Silver);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        // tier=Platinum avoids colliding with the wildcard "*" rule
        // SeedAgentAsync already created for Silver in this tenant.
        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(tier: 4, productType: productType));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Create_DuplicateTierAndProductType_Returns409()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var first = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest());
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest());
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Create_SameTierDifferentProductType_Returns201()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var first = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "Flight"));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "Hotel"));
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
    }

    [Fact]
    public async Task Create_AsAgencyAdmin_Returns403()
    {
        var (_, _, token) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ------------------------------------------------------------------ List

    [Fact]
    public async Task List_FiltersByTierProductTypeIsActive()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);
        await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "Flight"));
        await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "Hotel"));

        var response = await client.GetAsync("/api/v1/markup-rules?productType=Flight");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var items = body.GetProperty("items").EnumerateArray().ToList();

        Assert.All(items, i => Assert.Equal("Flight", i.GetProperty("productType").GetString()));
        Assert.Contains(items, i => i.GetProperty("productType").GetString() == "Flight");
    }

    // ---------------------------------------------------------------- Update

    [Fact]
    public async Task Update_ChangingProductTypeToExistingCombo_Returns409()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "Flight"));
        var second = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest(productType: "Hotel"));
        var secondId = (await second.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var update = await client.PutAsJsonAsync($"/api/v1/markup-rules/{secondId}", ValidCreateRequest(productType: "Flight"));

        Assert.Equal(HttpStatusCode.Conflict, update.StatusCode);
    }

    [Fact]
    public async Task Update_ChangingUnrelatedFieldOnly_Succeeds()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var create = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest());
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var update = await client.PutAsJsonAsync($"/api/v1/markup-rules/{id}", ValidCreateRequest(markupPercent: 0.2m));
        update.EnsureSuccessStatusCode();

        var body = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0.2m, body.GetProperty("markupPercent").GetDecimal());
    }

    // ------------------------------------------------------- Activate/Deactivate

    [Fact]
    public async Task Deactivate_ThenActivate_TogglesState()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var create = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest());
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var deactivate = await client.PostAsync($"/api/v1/markup-rules/{id}/deactivate", null);
        deactivate.EnsureSuccessStatusCode();
        Assert.False((await deactivate.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("isActive").GetBoolean());

        var activate = await client.PostAsync($"/api/v1/markup-rules/{id}/activate", null);
        activate.EnsureSuccessStatusCode();
        Assert.True((await activate.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Deactivate_CalledTwice_IsIdempotent()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var create = await client.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest());
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var first = await client.PostAsync($"/api/v1/markup-rules/{id}/deactivate", null);
        var second = await client.PostAsync($"/api/v1/markup-rules/{id}/deactivate", null);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
    }

    [Fact]
    public async Task Deactivate_AsAgencyAdmin_Returns403()
    {
        var (tenantId, _, adminSeedToken) = await TestData.SeedAgentAsync(fixture.Factory);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var admin = fixture.Factory.CreateAuthenticatedClient(adminToken);
        var create = await admin.PostAsJsonAsync("/api/v1/markup-rules", ValidCreateRequest());
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var agencyClient = fixture.Factory.CreateAuthenticatedClient(adminSeedToken);
        var response = await agencyClient.PostAsync($"/api/v1/markup-rules/{id}/deactivate", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
