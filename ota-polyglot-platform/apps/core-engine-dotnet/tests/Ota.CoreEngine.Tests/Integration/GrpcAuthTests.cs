using System.Net.Http.Json;
using System.Reflection;
using System.Text.Json;
using Grpc.Core;
using Microsoft.AspNetCore.Authorization;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using AgentTier = Ota.CoreEngine.Grpc.AgentTier;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P0-11 / P0-12: every gRPC call is authenticated, identity comes from the credential and not from the
/// message, and a frontend's service credential can only do what its configuration allows.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class GrpcAuthTests(OtaCoreEngineFixture fixture)
{
    private OtaCoreService.OtaCoreServiceClient Client(string? token = null) =>
        new(fixture.Factory.CreateGrpcChannel(token));

    private static SearchRequest Search(string tenantId, ChannelType channel = ChannelType.B2C, string agentId = "") => new()
    {
        Tenant = new TenantContext { TenantId = tenantId, Channel = channel, AgentId = agentId },
        ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = "2026-12-01", Adults = 1,
    };

    private async Task<string> ServiceTokenAsync(string clientId = TestServiceClients.BroadId, string secret = TestServiceClients.BroadSecret)
    {
        var response = await fixture.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/service/token", new { clientId, clientSecret = secret });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
    }

    private static async Task<StatusCode> CodeOfAsync(Func<Task> call) => (await Assert.ThrowsAsync<RpcException>(call)).StatusCode;

    // ---------------------------------------------------------------- no / bad credentials

    [Fact]
    public async Task EveryRpc_RefusesACallWithNoCredentials()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var anon = Client();
        var ctx = new TenantContext { TenantId = tenantId, AgentId = agentId.ToString() };

        Assert.Equal(StatusCode.Unauthenticated, await CodeOfAsync(() => anon.GetSupplierAvailabilityAsync(Search(tenantId)).ResponseAsync));
        Assert.Equal(StatusCode.Unauthenticated, await CodeOfAsync(() => anon.RevalidateOfferAsync(new RevalidateRequest { Tenant = ctx, OfferId = "x" }).ResponseAsync));
        Assert.Equal(StatusCode.Unauthenticated, await CodeOfAsync(() => anon.ProcessB2BBookingAsync(new B2BBookingRequest { Tenant = ctx, OfferId = "x", IdempotencyKey = "k" }).ResponseAsync));
        Assert.Equal(StatusCode.Unauthenticated, await CodeOfAsync(() => anon.IssueTicketAsync(new IssueTicketRequest { Tenant = ctx, BookingId = Guid.NewGuid().ToString() }).ResponseAsync));
    }

    [Fact]
    public async Task Control_ALegitimateAgentToken_IsAccepted()
    {
        var (tenantId, agentId, token) = await TestData.SeedAgentAsync(fixture.Factory);

        var response = await Client(token).GetSupplierAvailabilityAsync(Search(tenantId, ChannelType.B2BAgent, agentId.ToString()));

        Assert.NotEmpty(response.Offers);
    }

    [Theory]
    [InlineData("garbage")]
    [InlineData("a.b.c")]
    public async Task AMalformedToken_IsRefused(string token)
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(StatusCode.Unauthenticated, await CodeOfAsync(() => Client(token).GetSupplierAvailabilityAsync(Search(tenantId)).ResponseAsync));
    }

    [Fact]
    public async Task ARefreshToken_CannotBePresentedAsAnAccessToken()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var refresh = TestJwtKeys.Token(tenantId, agentId, tokenType: "refresh");

        Assert.Equal(StatusCode.Unauthenticated, await CodeOfAsync(() => Client(refresh).GetSupplierAvailabilityAsync(Search(tenantId)).ResponseAsync));
    }

    [Fact]
    public async Task ACustomerAudienceToken_IsRefused_EvenWithItsOwnValidKey()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var token = TestJwtKeys.Token(tenantId, agentId, TokenAudiences.Customers, TestJwtKeys.CustomersSigning());

        Assert.Equal(StatusCode.Unauthenticated, await CodeOfAsync(() => Client(token).GetSupplierAvailabilityAsync(Search(tenantId)).ResponseAsync));
    }

    [Fact]
    public async Task AnInternalAudienceTokenThatIsNotAServiceToken_IsRefused()
    {
        // right audience and a valid key, but shaped like a user token: audience, token type and actor must agree
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var token = TestJwtKeys.Token(tenantId, agentId, TokenAudiences.Internal, TestJwtKeys.InternalSigning());

        Assert.Equal(StatusCode.Unauthenticated, await CodeOfAsync(() => Client(token).GetSupplierAvailabilityAsync(Search(tenantId)).ResponseAsync));
    }

    // ---------------------------------------------------------------- identity comes from the token, not the message

    [Fact]
    public async Task ALoggedInAgent_CannotActForAnotherTenant_ByNamingItInTheMessage()
    {
        var (tenantA, agentA, tokenA) = await TestData.SeedAgentAsync(fixture.Factory);
        var (tenantB, _, _) = await TestData.SeedAgentAsync(fixture.Factory);

        var code = await CodeOfAsync(() => Client(tokenA).GetSupplierAvailabilityAsync(Search(tenantB, ChannelType.B2BAgent, agentA.ToString())).ResponseAsync);

        Assert.Equal(StatusCode.PermissionDenied, code);
    }

    [Fact]
    public async Task ALoggedInAgent_CannotActAsAnotherAgent_ByNamingItInTheMessage()
    {
        var (tenantId, _, tokenA) = await TestData.SeedAgentAsync(fixture.Factory);
        var (otherAgentId, _) = await TestData.SeedAgentUserAsync(fixture.Factory, tenantId, UserRole.AgencyAdmin);

        var code = await CodeOfAsync(() => Client(tokenA).GetSupplierAvailabilityAsync(Search(tenantId, ChannelType.B2BAgent, otherAgentId.ToString())).ResponseAsync);

        Assert.Equal(StatusCode.PermissionDenied, code);
    }

    [Fact]
    public async Task ALoggedInAgent_NeedsNoTenantInTheMessageAtAll()
    {
        var (_, _, token) = await TestData.SeedAgentAsync(fixture.Factory);
        // the whole TenantContext message is absent (null), not merely empty — identity comes from the token
        var request = new SearchRequest { ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = "2026-12-02", Adults = 1 };

        var response = await Client(token).GetSupplierAvailabilityAsync(request);

        Assert.NotEmpty(response.Offers);
    }

    [Fact]
    public async Task ALoggedInAgents_ChannelClaimInTheMessage_IsIgnored()
    {
        var (_, _, token) = await TestData.SeedAgentAsync(fixture.Factory);
        // the token says B2B_AGENT; the message claims B2C — the message loses, and nothing is rejected over it
        var request = new SearchRequest { ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = "2026-12-03", Adults = 1,
            Tenant = new TenantContext { Channel = ChannelType.B2C } };

        Assert.NotEmpty((await Client(token).GetSupplierAvailabilityAsync(request)).Offers);
    }

    [Fact]
    public async Task ABooking_NamingASubAgentThatIsNotUnderTheCaller_IsRefused()
    {
        var (tenantId, agentId, token) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-subagent-check");

        var code = await CodeOfAsync(() => Client(token).ProcessB2BBookingAsync(new B2BBookingRequest
        {
            Tenant = new TenantContext { SubAgentId = Guid.NewGuid().ToString() },
            OfferId = "AMADEUS-subagent-check", IdempotencyKey = $"key-{Guid.NewGuid()}", ContactEmail = "ops@test.example",
            Travelers = { new Traveler { FirstName = "T", LastName = "T", DocumentType = "PASSPORT", DocumentNumber = "P1" } },
        }).ResponseAsync);

        Assert.Equal(StatusCode.PermissionDenied, code);
        Assert.NotEqual(Guid.Empty, agentId);
    }

    [Fact]
    public async Task AnotherAgentInTheSameTenant_CannotTicketSomeoneElsesBooking()
    {
        var (tenantId, agentA, tokenA) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        var (_, tokenB) = await TestData.SeedAgentUserAsync(fixture.Factory, tenantId, UserRole.AgencyAdmin, creditLimit: 5000m);
        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-idor-check");
        var booking = await Client(tokenA).ProcessB2BBookingAsync(new B2BBookingRequest
        {
            OfferId = "AMADEUS-idor-check", IdempotencyKey = $"key-{Guid.NewGuid()}", ContactEmail = "ops@test.example",
            Travelers = { new Traveler { FirstName = "T", LastName = "T", DocumentType = "PASSPORT", DocumentNumber = "P1" } },
        });

        var stolen = await CodeOfAsync(() => Client(tokenB).IssueTicketAsync(new IssueTicketRequest { BookingId = booking.BookingId }).ResponseAsync);
        var own = await Client(tokenA).IssueTicketAsync(new IssueTicketRequest { BookingId = booking.BookingId });

        Assert.Equal(StatusCode.NotFound, stolen);     // answered exactly as if it did not exist
        Assert.Equal(Ota.CoreEngine.Grpc.BookingStatus.Confirmed, own.Status);
        Assert.NotEqual(Guid.Empty, agentA);
    }

    // ---------------------------------------------------------------- service credentials (frontends)

    [Fact]
    public async Task AService_MayAssertTheTenantForAnAnonymousSearch_PricedWithTheB2CRule()
    {
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Standard, seedConsumerRule: true);
        var token = await ServiceTokenAsync();

        var response = await Client(token).GetSupplierAvailabilityAsync(Search(tenantId));

        Assert.NotEmpty(response.Offers);
        Assert.All(response.Offers, o => Assert.Equal(0d, o.NetRate)); // never shown to a consumer (P4-8)
        // priced with the B2C rule: compare with the cost as the tenant's own agent sees it
        var costs = await Client(agentToken).GetSupplierAvailabilityAsync(Search(tenantId, ChannelType.B2BAgent, agentId.ToString()));
        Assert.Equal(costs.Offers.Select(o => Math.Round(o.NetRate * 1.06 + 10, 2)).Order(), response.Offers.Select(o => Math.Round(o.SellPrice, 2)).Order()); // the B2C rule
    }

    [Fact]
    public async Task AService_MayGiveAnAgentForPricingContext_OnlyAsFarAsTheTenantCanSeeIt()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Gold, markupPercent: 0.20m, subAgentDefaultMargin: 0m);
        await TestData.SeedAgentAsync(fixture.Factory, tenantId: tenantId, tier: Domain.AgentTier.Standard);
        var token = await ServiceTokenAsync();

        var asAgent = await Client(token).GetSupplierAvailabilityAsync(Search(tenantId, ChannelType.WhiteLabel, agentId.ToString()));

        Assert.All(asAgent.Offers, o => Assert.Equal(o.NetRate * 1.20, o.SellPrice, precision: 2)); // the Gold agent's own rule
    }

    [Fact]
    public async Task AService_CanNeverBookOrTicket()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        var anon = Client(await ServiceTokenAsync());
        var ctx = new TenantContext { TenantId = tenantId, Channel = ChannelType.B2C, AgentId = agentId.ToString() };

        Assert.Equal(StatusCode.PermissionDenied, await CodeOfAsync(() => anon.ProcessB2BBookingAsync(new B2BBookingRequest { Tenant = ctx, OfferId = "AMADEUS-x", IdempotencyKey = "k" }).ResponseAsync));
        Assert.Equal(StatusCode.PermissionDenied, await CodeOfAsync(() => anon.IssueTicketAsync(new IssueTicketRequest { Tenant = ctx, BookingId = Guid.NewGuid().ToString() }).ResponseAsync));
    }

    [Fact]
    public async Task AService_CannotActForATenantOutsideItsAllowList()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Standard);
        var token = await ServiceTokenAsync(TestServiceClients.SearchOnlyId, TestServiceClients.SearchOnlySecret);

        Assert.Equal(StatusCode.PermissionDenied, await CodeOfAsync(() => Client(token).GetSupplierAvailabilityAsync(Search(tenantId)).ResponseAsync));
    }

    [Fact]
    public async Task AService_CannotActForAChannelOutsideItsAllowList()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Standard);
        var token = await ServiceTokenAsync(); // B2C and WHITE_LABEL only

        Assert.Equal(StatusCode.PermissionDenied, await CodeOfAsync(() => Client(token).GetSupplierAvailabilityAsync(Search(tenantId, ChannelType.B2BAgent)).ResponseAsync));
        Assert.Equal(StatusCode.PermissionDenied, await CodeOfAsync(() => Client(token).GetSupplierAvailabilityAsync(Search(tenantId, ChannelType.Unspecified)).ResponseAsync));
    }

    [Fact]
    public async Task AService_WithoutTheRevalidateScope_CannotRevalidate()
    {
        var token = await ServiceTokenAsync(TestServiceClients.SearchOnlyId, TestServiceClients.SearchOnlySecret);

        var code = await CodeOfAsync(() => Client(token).RevalidateOfferAsync(new RevalidateRequest
        { Tenant = new TenantContext { TenantId = TestServiceClients.OnlyTenant, Channel = ChannelType.B2C }, OfferId = "x" }).ResponseAsync);

        Assert.Equal(StatusCode.PermissionDenied, code);
    }

    // ---------------------------------------------------------------- the service-token endpoint

    [Fact]
    public async Task ServiceTokenEndpoint_IssuesAShortLivedScopedTokenForTheInternalAudience()
    {
        var jwt = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(await ServiceTokenAsync());

        Assert.Equal(TokenAudiences.Internal, jwt.Audiences.Single());
        Assert.Equal(TestServiceClients.BroadId, jwt.Subject);
        Assert.Equal("service", jwt.Claims.Single(c => c.Type == ActorTypes.ClaimName).Value);
        Assert.Equal("revalidate search", jwt.Claims.Single(c => c.Type == "scope").Value);
        Assert.True(jwt.ValidTo - DateTime.UtcNow <= TimeSpan.FromMinutes(10.5));
    }

    [Theory]
    [InlineData("test-frontend", "wrong-secret")]
    [InlineData("no-such-client", "test-broad-secret-1")]
    [InlineData("", "")]
    public async Task ServiceTokenEndpoint_RefusesBadCredentials_WithoutSayingWhy(string clientId, string secret)
    {
        var known = await fixture.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/service/token", new { clientId = "test-frontend", clientSecret = "nope" });
        var response = await fixture.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/service/token", new { clientId, clientSecret = secret });

        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(await known.Content.ReadAsStringAsync(), await response.Content.ReadAsStringAsync());
    }

    // ---------------------------------------------------------------- deny by default

    [Fact]
    public void EveryRpc_DeclaresItsAuthorization_SoANewOneCannotShipOpen()
    {
        var rpcs = typeof(OtaCoreService.OtaCoreServiceBase).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetParameters().Length == 2 && m.GetParameters()[1].ParameterType == typeof(ServerCallContext))
            .Select(m => m.Name).ToList();
        Assert.NotEmpty(rpcs);

        foreach (var name in rpcs)
        {
            var implemented = typeof(OtaCoreGrpcService).GetMethod(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
            Assert.True(implemented is not null, $"{name} is not implemented");
            var attr = implemented!.GetCustomAttribute<AuthorizeAttribute>();
            Assert.True(attr is not null, $"RPC {name} has no [Authorize] — it would be callable without credentials");
            Assert.Equal(GrpcAuth.Scheme, attr!.AuthenticationSchemes);
            Assert.False(string.IsNullOrEmpty(attr.Policy), $"RPC {name} must name an explicit policy");
        }
    }
}
