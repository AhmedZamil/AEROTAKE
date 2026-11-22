using System.Net;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>Directly exercises OtaDbContext's global query filter — the
/// mechanism that makes cross-tenant leaks structurally impossible rather
/// than dependent on every query remembering a WHERE clause.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class TenantIsolationTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public async Task Agent_CreatedForTenantA_IsInvisibleWhenQueriedAsTenantB()
    {
        var (_, agentAId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 100m);
        var (tenantB, _, tokenB) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 200m);

        var client = fixture.Factory.CreateAuthenticatedClient(tokenB);

        // Tenant A's agent exists (ReloadAgentAsync bypasses filters and finds
        // it), but tenant B's own request for that same ID must 404 — not
        // because the ID is wrong, but because the row belongs to a different tenant.
        var stillExists = await TestData.ReloadAgentAsync(fixture.Factory, agentAId);
        Assert.NotNull(stillExists);

        var response = await client.GetAsync($"/api/v1/agents/{agentAId}/credit");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
