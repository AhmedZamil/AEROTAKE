using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Grpc.Core;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P3-1: customer sign-in over HTTP, end to end, against a stand-in identity provider (a real verifier, real keys and
/// signatures, just not Google). Covers the flow, the separation between customer and agent tokens, and every way a request can be wrong.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CustomerAuthEndpointTests(OtaCoreEngineFixture fixture)
{
    private readonly TestIdp _idp = new();
    private WebApplicationFactory<Program>? _factory;

    private WebApplicationFactory<Program> Factory => _factory ??= fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
    {
        s.RemoveAll<IExternalIdentityVerifier>();
        s.AddSingleton(_idp.Verifier());
    }));

    private HttpClient Client(string? tenant, string? bearer = null)
    {
        var client = Factory.CreateClient();
        if (tenant is not null) client.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        if (bearer is not null) client.DefaultRequestHeaders.Authorization = new("Bearer", bearer);
        return client;
    }

    private static object Social(string idToken, string provider = "google", string? nonce = null) => new { provider, idToken, nonce };

    private async Task<(string Tenant, JsonElement Body)> SignInAsync(string? sub = null, string? email = "sam@example.test", string? tenant = null)
    {
        tenant ??= await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var response = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social",
            Social(_idp.IdToken(sub ?? Guid.NewGuid().ToString("N"), email, emailVerified: true, givenName: "Sam", familyName: "Rahman")));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (tenant, await response.Content.ReadFromJsonAsync<JsonElement>());
    }

    // ------------------------------------------------------------------------------------------ the happy path

    [Fact]
    public async Task ASignIn_ReturnsCustomerTokens_ForTheRightTenantAndActor()
    {
        var (tenant, body) = await SignInAsync();

        var access = new JwtSecurityTokenHandler().ReadJwtToken(body.GetProperty("accessToken").GetString());
        var customer = body.GetProperty("customer");
        Assert.True(body.GetProperty("isNewCustomer").GetBoolean());
        Assert.Equal(TokenAudiences.Customers, access.Audiences.Single());
        Assert.Equal(customer.GetProperty("id").GetString(), access.Subject);
        Assert.Equal(tenant, access.Claims.Single(c => c.Type == "tenant_id").Value);
        Assert.Equal(("customer", "B2C", "access"), (access.Claims.Single(c => c.Type == ActorTypes.ClaimName).Value, access.Claims.Single(c => c.Type == "channel").Value, access.Claims.Single(c => c.Type == "token_type").Value));
        Assert.Equal(("sam@example.test", "Sam", "Rahman"), (customer.GetProperty("email").GetString(), customer.GetProperty("firstName").GetString(), customer.GetProperty("lastName").GetString()));
    }

    [Fact]
    public async Task ASecondSignIn_IsNotNew_AndTheCustomerCanReadTheirOwnAccount()
    {
        var (tenant, first) = await SignInAsync(sub: "returning-1");
        var again = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social(_idp.IdToken("returning-1", "sam@example.test", emailVerified: true)));
        var second = await again.Content.ReadFromJsonAsync<JsonElement>();

        Assert.False(second.GetProperty("isNewCustomer").GetBoolean());
        Assert.Equal(first.GetProperty("customer").GetProperty("id").GetString(), second.GetProperty("customer").GetProperty("id").GetString());

        var me = await Client(tenant, second.GetProperty("accessToken").GetString()).GetAsync("/api/v1/customers/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal("sam@example.test", (await me.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("email").GetString());
    }

    // ------------------------------------------------------------------------------------------ customer and agent tokens are not interchangeable

    [Fact]
    public async Task ACustomerToken_OpensCustomerEndpoints_ButNotAgentOnes_AndNotGrpc()
    {
        var (tenant, body) = await SignInAsync();
        var token = body.GetProperty("accessToken").GetString()!;
        var (_, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, token).GetAsync($"/api/v1/agents/{agentId}/credit")).StatusCode);

        var grpc = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(token));
        var ex = await Assert.ThrowsAsync<RpcException>(() => grpc.GetSupplierAvailabilityAsync(new SearchRequest { Tenant = new TenantContext { TenantId = tenant } }).ResponseAsync);
        Assert.Equal(StatusCode.Unauthenticated, ex.StatusCode);
    }

    [Fact]
    public async Task AnAgentToken_IsRefusedOnTheCustomerEndpoint_ValidThoughItIsEverywhereElse()
    {
        var (tenant, _, agentToken) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, agentToken).GetAsync("/api/v1/customers/me")).StatusCode);
    }

    [Fact]
    public async Task TheCustomerEndpoint_WantsAnAccessToken_NotARefreshToken_AndNotNothing()
    {
        var (tenant, body) = await SignInAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant).GetAsync("/api/v1/customers/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, body.GetProperty("refreshToken").GetString()).GetAsync("/api/v1/customers/me")).StatusCode);
    }

    [Fact]
    public async Task TheTenantOfARequest_ComesFromTheCustomersToken_NotFromAHeaderTheyPick()
    {
        var (_, body) = await SignInAsync();
        var otherTenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        // even with the customer's own valid token, the tenant comes from the token, not from a header the caller picks
        var me = await Client(otherTenant, body.GetProperty("accessToken").GetString()).GetAsync("/api/v1/customers/me");

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal(body.GetProperty("customer").GetProperty("id").GetString(), (await me.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString());
    }

    // ------------------------------------------------------------------------------------------ bad requests

    [Fact]
    public async Task ATokenThatCannotBeVerified_Is401_AndCreatesNoCustomer()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        foreach (var bad in new[]
                 {
                     _idp.IdToken("x", audience: "another-apps-client"), _idp.IdToken("x", signer: _idp.Stranger),
                     _idp.IdToken("x", lifetime: TimeSpan.FromMinutes(-5)), _idp.UnsignedToken("x"), "junk",
                 })
        {
            var response = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social(bad));
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("invalid_provider_token", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        }

        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Customers.CountAsync());
    }

    [Fact]
    public async Task ANonceThatDoesNotMatch_Is401()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var token = _idp.IdToken("nonce-1", nonce: "expected");

        Assert.Equal(HttpStatusCode.OK, (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social(token, nonce: "expected"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social(token, nonce: "replayed"))).StatusCode);
    }

    [Theory]
    [InlineData(null, "tok")]
    [InlineData("google", null)]
    [InlineData("google", "")]
    [InlineData("", "tok")]
    public async Task AMissingProviderOrToken_Is400(string? provider, string? token)
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.BadRequest, (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", new { provider, idToken = token })).StatusCode);
    }

    [Fact]
    public async Task AnAbsurdlyLargeToken_Is400_BeforeAnyWorkIsDone()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.BadRequest, (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social(new string('a', 100_000)))).StatusCode);
    }

    [Fact]
    public async Task AProviderWeDoNotSupport_Is400()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.BadRequest, (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social(_idp.IdToken("x"), provider: "myspace"))).StatusCode);
    }

    [Fact]
    public async Task WhenGoogleIsNotConfigured_TheAnswerIs503ProviderNotConfigured_NotAMisleading401()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        // the plain factory: the real Google verifier, with no GOOGLE_CLIENT_IDS
        var response = await fixture.Factory.CreateClient().WithTenant(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social("any.token.here"));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("provider_not_configured", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
    }

    // ------------------------------------------------------------------------------------------ which tenants may sign customers in

    [Fact]
    public async Task ATenantThatIsNotARegisteredB2CStorefront_Is404_SoAccountsCannotBeCreatedInsideAnyTenantIdACallerInvents()
    {
        var b2bOnly = $"b2b-only-{Guid.NewGuid():N}";
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            var t = new Ota.CoreEngine.Domain.Tenant { TenantId = b2bOnly, DisplayName = "b2b", SellCurrency = "USD" };
            t.Domains.Add(new Ota.CoreEngine.Domain.TenantDomain { Host = $"{Guid.NewGuid():N}.b2b.example.test", Channel = "B2B_AGENT", BrandName = "b", LogoUrl = "/l", PrimaryColor = "#1", AccentColor = "#2", MarkupProfile = "m" });
            db.Tenants.Add(t);
            await db.SaveChangesAsync();
        }
        var inactive = await TestData.RegisterB2CTenantAsync(fixture.Factory, active: false);

        foreach (var tenant in new[] { "no-such-tenant", b2bOnly, inactive })
            Assert.Equal(HttpStatusCode.NotFound, (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social(_idp.IdToken("x")))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Client(null).PostAsJsonAsync("/api/v1/auth/customer/social", Social(_idp.IdToken("x")))).StatusCode); // no tenant header at all
    }

    [Fact]
    public async Task ASuspendedCustomer_Is403_OnSignIn()
    {
        var (tenant, body) = await SignInAsync(sub: "suspend-me");
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
            await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Customers.ExecuteUpdateAsync(s => s.SetProperty(c => c.IsActive, false));

        var response = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", Social(_idp.IdToken("suspend-me", "sam@example.test", emailVerified: true)));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, body.GetProperty("accessToken").GetString()).GetAsync("/api/v1/customers/me")).StatusCode); // and an existing session stops working
    }

    // ------------------------------------------------------------------------------------------ refresh and logout

    private async Task<HttpResponseMessage> RefreshAsync(string tenant, string? refreshToken) =>
        await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/refresh", new { refreshToken });

    [Fact]
    public async Task Refreshing_GivesANewPair_AndTheOldRefreshTokenStopsWorking()
    {
        var (tenant, first) = await SignInAsync();
        var oldRefresh = first.GetProperty("refreshToken").GetString();

        var refreshed = await RefreshAsync(tenant, oldRefresh);
        var second = await refreshed.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        Assert.NotEqual(oldRefresh, second.GetProperty("refreshToken").GetString());
        Assert.Equal(HttpStatusCode.OK, (await Client(tenant, second.GetProperty("accessToken").GetString()).GetAsync("/api/v1/customers/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(tenant, oldRefresh)).StatusCode);       // a stolen, already-used copy is dead
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(tenant, second.GetProperty("refreshToken").GetString())).StatusCode); // the new one lives on
    }

    [Fact]
    public async Task TwoSimultaneousRefreshes_WithOneToken_OnlyOneSucceeds()
    {
        var (tenant, first) = await SignInAsync();
        var refresh = first.GetProperty("refreshToken").GetString();

        var codes = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => Task.Run(async () => (await RefreshAsync(tenant, refresh)).StatusCode)));

        Assert.Equal(1, codes.Count(c => c == HttpStatusCode.OK));
        Assert.Equal(5, codes.Count(c => c == HttpStatusCode.Unauthorized));
    }

    [Fact]
    public async Task Refresh_RefusesEverythingThatIsNotAGenuineCustomerRefreshToken_WithOneUndistinguishableAnswer()
    {
        var (tenant, body) = await SignInAsync();
        var (otherTenant, _) = await SignInAsync();
        var (_, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory);
        var refreshToken = body.GetProperty("refreshToken").GetString()!;

        var attempts = new (string Label, string Tenant, string? Token)[]
        {
            ("garbage", tenant, "not-a-token"), ("empty", tenant, ""), ("null", tenant, null),
            ("an ACCESS token", tenant, body.GetProperty("accessToken").GetString()),
            ("an agent's token", tenant, agentToken),
            ("a real token presented for a different tenant", otherTenant, refreshToken),
        };
        var answers = new List<string>();
        foreach (var a in attempts)
        {
            var response = await RefreshAsync(a.Tenant, a.Token);
            Assert.True(response.StatusCode == HttpStatusCode.Unauthorized, a.Label);
            answers.Add(await response.Content.ReadAsStringAsync());
        }

        Assert.Single(answers.Distinct()); // no oracle: every failure reads the same
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(tenant, refreshToken)).StatusCode); // and the real one was untouched by the bad attempts
        Assert.NotEqual(Guid.Empty, agentId);
    }

    [Fact]
    public async Task ALogout_EndsTheSession_ForRealNotJustOnTheClient()
    {
        var (tenant, body) = await SignInAsync();
        var refresh = body.GetProperty("refreshToken").GetString();

        var logout = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/logout", new { refreshToken = refresh });

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(tenant, refresh)).StatusCode);
    }

    [Fact]
    public async Task Logout_IsAlways204_SoItCannotBeUsedToProbeTokens_AndOnlyARealTokenRevokesAnything()
    {
        var (tenant, body) = await SignInAsync();
        var (otherTenant, _) = await SignInAsync();
        var refresh = body.GetProperty("refreshToken").GetString();

        foreach (var junk in new[] { "junk", "", null })
            Assert.Equal(HttpStatusCode.NoContent, (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/logout", new { refreshToken = junk })).StatusCode);
        // a real token, but claimed under another tenant: 204, and it revokes nothing
        Assert.Equal(HttpStatusCode.NoContent, (await Client(otherTenant).PostAsJsonAsync("/api/v1/auth/customer/logout", new { refreshToken = refresh })).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(tenant, refresh)).StatusCode);
    }

    [Fact]
    public async Task ASuspendedCustomer_CannotRefresh()
    {
        var (tenant, body) = await SignInAsync(sub: "suspend-refresh");
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
            await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Customers.ExecuteUpdateAsync(s => s.SetProperty(c => c.IsActive, false));

        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(tenant, body.GetProperty("refreshToken").GetString())).StatusCode);
    }
}

internal static class HttpClientExtensions
{
    public static HttpClient WithTenant(this HttpClient client, string tenant)
    {
        client.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        return client;
    }
}
