using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

[Collection(OtaCoreEngineCollection.Name)]
public class AgentsControllerTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public async Task GetCredit_WithTenantHeader_ReturnsAgentCredit()
    {
        var (tenantId, agentId, token) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 750m);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.GetAsync($"/api/v1/agents/{agentId}/credit");
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(750m, body.GetProperty("creditLimit").GetDecimal());
        Assert.Equal(0m, body.GetProperty("creditUsed").GetDecimal());
    }

    [Fact]
    public async Task GetCredit_MissingTenantHeader_Returns401()
    {
        var client = fixture.Factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/agents/{Guid.NewGuid()}/credit");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetCredit_UnknownAgentId_Returns404()
    {
        var (tenantId, _, token) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.GetAsync($"/api/v1/agents/{Guid.NewGuid()}/credit");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
