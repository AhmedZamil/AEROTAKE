using System.Net;
using System.Net.Http.Json;
using Grpc.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Tenancy;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>
/// C1: proves Agent.IsActive actually blocks something, at the two points
/// confirmed in scope — login and new-booking creation — rather than being an
/// inert flag only enforced inside AgenciesController itself. Deliberately its
/// own file (like RoleAuthorizationTests) since it spans both the REST auth
/// controller and the gRPC booking service around one business rule.
/// </summary>
[Collection(OtaCoreEngineCollection.Name)]
public class AgencyDeactivationEnforcementTests(OtaCoreEngineFixture fixture)
{
    private const string TestPassword = "test-password"; // matches TestData.SeedAgentAsync's seeded user

    [Fact]
    public async Task Login_UserOfDeactivatedAgency_Returns403()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, isActive: false);
        var agent = await TestData.ReloadAgentAsync(fixture.Factory, agentId);
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Tenant-ID", tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/auth/login",
            new { email = agent.Email, password = TestPassword, deviceToken = (string?)null });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Login_UserOfActiveAgency_StillWorks()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, isActive: true);
        var agent = await TestData.ReloadAgentAsync(fixture.Factory, agentId);
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Tenant-ID", tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/auth/login",
            new { email = agent.Email, password = TestPassword, deviceToken = (string?)null });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Login_AdminWithNoAgent_StillWorks()
    {
        // Admins have no Agent at all (AgentId is null) — must never be
        // affected by the new Agent.IsActive check. Seeded inline (rather than
        // via TestData.SeedAdminUserAsync, which only returns a token) so the
        // real email/password are available to exercise the actual Login endpoint.
        var tenantId = $"test-tenant-{Guid.NewGuid():N}";
        var email = $"{Guid.NewGuid():N}@test.example";

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            var tenantAccessor = scope.ServiceProvider.GetRequiredService<ITenantAccessor>();
            tenantAccessor.Set(new Ota.CoreEngine.Tenancy.TenantContext { TenantId = tenantId });

            db.Users.Add(new User
            {
                TenantId = tenantId,
                Email = email,
                PasswordHash = passwordHasher.Hash(TestPassword),
                FirstName = "Admin",
                LastName = "User",
                EmailVerified = true,
                IsActive = true,
                AgentId = null,
                Role = UserRole.Admin,
            });
            await db.SaveChangesAsync();
        }

        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Tenant-ID", tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/auth/login",
            new { email, password = TestPassword, deviceToken = (string?)null });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task ProcessB2BBooking_ForDeactivatedAgency_FailsWithFailedPrecondition()
    {
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m, isActive: false);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        var request = new B2BBookingRequest
        {
            Tenant = new Ota.CoreEngine.Grpc.TenantContext
            {
                TenantId = tenantId,
                Channel = ChannelType.B2BAgent,
                AgentId = agentId.ToString(),
                AgentTier = Ota.CoreEngine.Grpc.AgentTier.Gold,
                Currency = "USD",
            },
            OfferId = "AMADEUS-deactivated-agency",
            IdempotencyKey = $"key-{Guid.NewGuid()}",
            ContactEmail = "ops@test.example",
            Travelers = { new Traveler { FirstName = "Test", LastName = "Traveler", DocumentType = "PASSPORT", DocumentNumber = "P0000000" } },
        };

        var ex = await Assert.ThrowsAsync<RpcException>(() => client.ProcessB2BBookingAsync(request).ResponseAsync);
        Assert.Equal(StatusCode.FailedPrecondition, ex.StatusCode);
    }
}
