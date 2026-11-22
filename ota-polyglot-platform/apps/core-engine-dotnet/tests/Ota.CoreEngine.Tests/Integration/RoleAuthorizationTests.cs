using System.Net;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>
/// B1: role-based + same-tenant cross-agent authorization. TenantIsolationTests
/// covers the EF global filter (cross-tenant); this covers the layer above it —
/// two agencies in the *same* tenant must not be able to read each other's
/// credit/ledger/bookings, and platform Admins must be able to read any of them.
/// </summary>
[Collection(OtaCoreEngineCollection.Name)]
public class RoleAuthorizationTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public async Task GetCredit_ForAnotherAgentInSameTenant_Returns404NotForbidden()
    {
        var (tenantId, agentAId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 100m);
        var (_, tokenB) = await TestData.SeedAgentUserAsync(fixture.Factory, tenantId, UserRole.AgencyAdmin);
        var client = fixture.Factory.CreateAuthenticatedClient(tokenB);

        var response = await client.GetAsync($"/api/v1/agents/{agentAId}/credit");

        // 404, not 403: an unauthorized caller shouldn't be able to tell a
        // real-but-not-theirs agentId apart from a made-up one.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetCredit_ForOwnAgent_Returns200()
    {
        var (_, agentId, token) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 300m);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.GetAsync($"/api/v1/agents/{agentId}/credit");

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task GetCredit_AsAgencyUser_ForOwnAgent_Returns200()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 300m);
        var (ownAgentId, userToken) = await TestData.SeedAgentUserAsync(fixture.Factory, tenantId, UserRole.AgencyUser, creditLimit: 300m);
        var client = fixture.Factory.CreateAuthenticatedClient(userToken);

        var response = await client.GetAsync($"/api/v1/agents/{ownAgentId}/credit");

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task GetCredit_AsAdmin_ForAnyAgentInTenant_Returns200()
    {
        var (tenantId, agentAId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 400m);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.GetAsync($"/api/v1/agents/{agentAId}/credit");

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task GetLedger_ForAnotherAgentInSameTenant_Returns404()
    {
        var (tenantId, agentAId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var (_, tokenB) = await TestData.SeedAgentUserAsync(fixture.Factory, tenantId, UserRole.AgencyUser);
        var client = fixture.Factory.CreateAuthenticatedClient(tokenB);

        var response = await client.GetAsync($"/api/v1/agents/{agentAId}/ledger");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetBookingByPnr_OwnedByAnotherAgentInSameTenant_Returns404()
    {
        var (tenantId, agentAId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var pnr = await TestData.SeedBookingAsync(fixture.Factory, tenantId, agentAId);
        var (_, tokenB) = await TestData.SeedAgentUserAsync(fixture.Factory, tenantId, UserRole.AgencyAdmin);
        var client = fixture.Factory.CreateAuthenticatedClient(tokenB);

        var response = await client.GetAsync($"/api/v1/bookings/{pnr}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetBookingByPnr_OwnedByCallersOwnAgent_Returns200()
    {
        var (tenantId, agentId, token) = await TestData.SeedAgentAsync(fixture.Factory);
        var pnr = await TestData.SeedBookingAsync(fixture.Factory, tenantId, agentId);
        var client = fixture.Factory.CreateAuthenticatedClient(token);

        var response = await client.GetAsync($"/api/v1/bookings/{pnr}");

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task GetBookingByPnr_AsAdmin_OwnedByAnyAgent_Returns200()
    {
        var (tenantId, agentAId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var pnr = await TestData.SeedBookingAsync(fixture.Factory, tenantId, agentAId);
        var adminToken = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        var client = fixture.Factory.CreateAuthenticatedClient(adminToken);

        var response = await client.GetAsync($"/api/v1/bookings/{pnr}");

        response.EnsureSuccessStatusCode();
    }
}
