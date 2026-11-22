using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tenancy;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>
/// C2: proves AuthController.Register's default-tier lookup actually reads
/// AgentTierProfile.IsDefault instead of the old hardcoded AgentTier.Standard.
/// No Register test coverage existed before this.
/// </summary>
[Collection(OtaCoreEngineCollection.Name)]
public class AuthControllerTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public async Task Register_WithConfiguredDefaultTier_UsesIt()
    {
        var tenantId = $"test-tenant-{Guid.NewGuid():N}";
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            var tenantAccessor = scope.ServiceProvider.GetRequiredService<ITenantAccessor>();
            tenantAccessor.Set(new TenantContext { TenantId = tenantId });
            db.AgentTierProfiles.Add(new AgentTierProfile { TenantId = tenantId, Tier = AgentTier.Platinum, Name = "Platinum", IsDefault = true });
            await db.SaveChangesAsync();
        }

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Tenant-ID", tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            agencyName = "Platinum Default Agency",
            email = $"{Guid.NewGuid():N}@test.example",
            password = "Passw0rd!!",
            firstName = "Test",
            lastName = "User",
        });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var agentId = body.GetProperty("agentId").GetGuid();

        var agent = await TestData.ReloadAgentAsync(fixture.Factory, agentId);
        Assert.Equal(AgentTier.Platinum, agent.Tier);
    }

    [Fact]
    public async Task Register_WithNoTierProfilesConfigured_FallsBackToStandard()
    {
        var tenantId = $"test-tenant-{Guid.NewGuid():N}"; // no AgentTierProfile rows for this tenant

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Tenant-ID", tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            agencyName = "No Profile Agency",
            email = $"{Guid.NewGuid():N}@test.example",
            password = "Passw0rd!!",
            firstName = "Test",
            lastName = "User",
        });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var agentId = body.GetProperty("agentId").GetGuid();

        var agent = await TestData.ReloadAgentAsync(fixture.Factory, agentId);
        Assert.Equal(AgentTier.Standard, agent.Tier);
    }
}
