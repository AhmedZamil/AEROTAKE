using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P3-4: a session ends when it should — at once, not 15 minutes later — and stays ended. Sign-out, sign-out-everywhere and
/// suspension are all checked live on every customer request, and the records are durable (Postgres, not a cache that can evict them).</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CustomerSessionTests(OtaCoreEngineFixture fixture)
{
    private readonly TestIdp _idp = new();
    private WebApplicationFactory<Program>? _factory;

    private WebApplicationFactory<Program> Factory => _factory ??= fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
    {
        s.RemoveAll<IExternalIdentityVerifier>();
        s.AddSingleton(_idp.Verifier());
    }));

    private HttpClient Client(string tenant, string? bearer = null)
    {
        var c = Factory.CreateClient();
        c.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        if (bearer is not null) c.DefaultRequestHeaders.Authorization = new("Bearer", bearer);
        return c;
    }

    private async Task<(string Access, string Refresh, string CustomerId)> SignInAsync(string tenant, string sub, string email)
    {
        var r = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", new { provider = "google", idToken = _idp.IdToken(sub, email, emailVerified: true) });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var body = await r.Content.ReadFromJsonAsync<JsonElement>();
        return (body.GetProperty("accessToken").GetString()!, body.GetProperty("refreshToken").GetString()!, body.GetProperty("customer").GetProperty("id").GetString()!);
    }

    private async Task<HttpStatusCode> MeAsync(string tenant, string access) => (await Client(tenant, access).GetAsync("/api/v1/customers/me")).StatusCode;
    private async Task<HttpStatusCode> RefreshAsync(string tenant, string refresh) => (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/refresh", new { refreshToken = refresh })).StatusCode;
    private async Task LogoutAsync(string tenant, string refresh) => await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/logout", new { refreshToken = refresh });

    private async Task<T> DbAsync<T>(string tenant, Func<OtaDbContext, Task<T>> body)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        return await body(scope.ServiceProvider.GetRequiredService<OtaDbContext>());
    }

    // ------------------------------------------------------------------------------------------ sign-out

    [Fact]
    public async Task SigningOut_KillsTheAccessTokenAtOnce_NotAfterItsFifteenMinutes()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var (access, refresh, _) = await SignInAsync(tenant, "so-1", "a@example.test");
        Assert.Equal(HttpStatusCode.OK, await MeAsync(tenant, access));

        await LogoutAsync(tenant, refresh);

        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, access));  // the SAME access token, still unexpired, is dead
        Assert.Equal(HttpStatusCode.Unauthorized, await RefreshAsync(tenant, refresh));
    }

    [Fact]
    public async Task SigningOutOfOneDevice_LeavesTheCustomersOtherSessionsAlone()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var phone = await SignInAsync(tenant, "two-devices", "a@example.test");
        var laptop = await SignInAsync(tenant, "two-devices", "a@example.test"); // same customer, a second sign-in

        await LogoutAsync(tenant, phone.Refresh);

        Assert.Equal(phone.CustomerId, laptop.CustomerId);
        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, phone.Access));
        Assert.Equal(HttpStatusCode.OK, await MeAsync(tenant, laptop.Access));
        Assert.Equal(HttpStatusCode.OK, await RefreshAsync(tenant, laptop.Refresh));
    }

    [Fact]
    public async Task ARefreshedSession_IsStillOneSession_SoSigningOutEndsEveryTokenInTheChain()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var first = await SignInAsync(tenant, "chain-1", "a@example.test");
        var refreshed = await (await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/refresh", new { refreshToken = first.Refresh })).Content.ReadFromJsonAsync<JsonElement>();
        var (access2, refresh2) = (refreshed.GetProperty("accessToken").GetString()!, refreshed.GetProperty("refreshToken").GetString()!);
        Assert.Equal(new JwtSecurityTokenHandler().ReadJwtToken(first.Access).Claims.Single(c => c.Type == "sid").Value,
                     new JwtSecurityTokenHandler().ReadJwtToken(access2).Claims.Single(c => c.Type == "sid").Value); // same session

        await LogoutAsync(tenant, refresh2); // signing out with the NEWEST refresh token…

        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, access2));      // …ends the new access token
        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, first.Access)); // …and the one from before the refresh
    }

    // ------------------------------------------------------------------------------------------ sign out everywhere

    [Fact]
    public async Task SignOutEverywhere_EndsEverySession_AccessAndRefreshAlike()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var phone = await SignInAsync(tenant, "everywhere", "a@example.test");
        var laptop = await SignInAsync(tenant, "everywhere", "a@example.test");

        var response = await Client(tenant, phone.Access).PostAsync("/api/v1/customers/me/logout-all", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        foreach (var s in new[] { phone, laptop })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, s.Access));
            Assert.Equal(HttpStatusCode.Unauthorized, await RefreshAsync(tenant, s.Refresh));
        }
    }

    [Fact]
    public async Task SigningStraightBackIn_AfterSigningOutEverywhere_WorksEvenWithinTheSameSecond()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var before = await SignInAsync(tenant, "same-second", "a@example.test");
        await Client(tenant, before.Access).PostAsync("/api/v1/customers/me/logout-all", null);

        var after = await SignInAsync(tenant, "same-second", "a@example.test"); // immediately: milliseconds, not seconds, decide "older"

        Assert.Equal(HttpStatusCode.OK, await MeAsync(tenant, after.Access));
        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, before.Access));
    }

    [Fact]
    public async Task SignOutEverywhere_TouchesOnlyThatCustomer()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var alice = await SignInAsync(tenant, "alice-x", "alice@example.test");
        var bob = await SignInAsync(tenant, "bob-x", "bob@example.test");

        await Client(tenant, alice.Access).PostAsync("/api/v1/customers/me/logout-all", null);

        Assert.Equal(HttpStatusCode.OK, await MeAsync(tenant, bob.Access));
    }

    [Fact]
    public async Task TheSignOutEverywhereEndpoint_NeedsACustomerToken()
    {
        var (tenant, _, agentToken) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, agentToken).PostAsync("/api/v1/customers/me/logout-all", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant).PostAsync("/api/v1/customers/me/logout-all", null)).StatusCode);
    }

    // ------------------------------------------------------------------------------------------ suspension

    [Fact]
    public async Task SuspendingACustomer_LocksThemOutOfTheirExistingSessionImmediately_AndReinstatingRestoresIt()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var s = await SignInAsync(tenant, "susp", "a@example.test");

        await DbAsync(tenant, db => db.Customers.ExecuteUpdateAsync(x => x.SetProperty(c => c.IsActive, false)));
        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, s.Access));      // no waiting for the token to expire
        Assert.Equal(HttpStatusCode.Unauthorized, await RefreshAsync(tenant, s.Refresh));
        // /me checks the customer itself, so it proves little about the SCHEME. logout-all does no checking of its own: refusing it here
        // means the authentication scheme is what turned the suspended customer away — for every present and future customer endpoint.
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, s.Access).PostAsync("/api/v1/customers/me/logout-all", null)).StatusCode);

        await DbAsync(tenant, db => db.Customers.ExecuteUpdateAsync(x => x.SetProperty(c => c.IsActive, true)));
        Assert.Equal(HttpStatusCode.OK, await MeAsync(tenant, s.Access));                // a suspension is not a revocation of the tokens themselves
    }

    [Fact]
    public async Task ErasingACustomer_EndsTheirSessionImmediately()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var s = await SignInAsync(tenant, "erased", "a@example.test");

        await DbAsync(tenant, db => db.Customers.ExecuteUpdateAsync(x => x.SetProperty(c => c.DeletedAt, DateTimeOffset.UtcNow)));

        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, s.Access));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, s.Access).PostAsync("/api/v1/customers/me/logout-all", null)).StatusCode); // via the scheme alone
    }

    // ------------------------------------------------------------------------------------------ malformed and cross-tenant

    [Fact]
    public async Task ACustomerTokenWithoutSessionClaims_IsRefused_EvenWithAValidSignature()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var s = await SignInAsync(tenant, "oldshape", "a@example.test");
        // a token shaped like the ones issued before sessions existed: right key, right audience, but no sid / iat_ms
        var jwt = new JwtSecurityToken("ota-core-engine", TokenAudiences.Customers, new[]
        {
            new Claim("sub", s.CustomerId), new Claim("tenant_id", tenant), new Claim("channel", "B2C"),
            new Claim(ActorTypes.ClaimName, "customer"), new Claim("token_type", "access"),
        }, expires: DateTime.UtcNow.AddMinutes(5), signingCredentials: TestJwtKeys.CustomersSigning());

        Assert.Equal(HttpStatusCode.Unauthorized, await MeAsync(tenant, new JwtSecurityTokenHandler().WriteToken(jwt)));
    }

    [Fact]
    public async Task ASessionIsOnlyValidForItsOwnTenantAndCustomer()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var s = await SignInAsync(tenant, "scope", "a@example.test");
        var claims = new JwtSecurityTokenHandler().ReadJwtToken(s.Access).Claims.ToDictionary(c => c.Type, c => c.Value);
        using var scope = fixture.Factory.Services.CreateScope(); // NO ambient tenant: authentication runs before it exists
        var sessions = scope.ServiceProvider.GetRequiredService<ICustomerSessions>();
        var (customer, sid, iat) = (Guid.Parse(s.CustomerId), claims["sid"], long.Parse(claims["iat_ms"]));

        Assert.True(await sessions.IsValidAsync(tenant, customer, sid, iat, default));
        Assert.False(await sessions.IsValidAsync("some-other-tenant", customer, sid, iat, default));   // right customer id, wrong tenant
        Assert.False(await sessions.IsValidAsync(tenant, Guid.NewGuid(), sid, iat, default));          // unknown customer
    }

    // ------------------------------------------------------------------------------------------ durability and atomicity

    [Fact]
    public async Task RevocationsAreStoredInThePostgresDatabase_SoACacheEvictionCannotBringATokenBackToLife()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var s = await SignInAsync(tenant, "durable", "a@example.test");
        var claims = new JwtSecurityTokenHandler().ReadJwtToken(s.Refresh).Claims.ToDictionary(c => c.Type, c => c.Value);

        await LogoutAsync(tenant, s.Refresh);

        var stored = await DbAsync(tenant, db => db.RevokedTokens.Select(r => r.TokenId).ToListAsync());
        Assert.Contains($"sid:{claims["sid"]}", stored);   // the ended session
        Assert.Contains($"jti:{claims["jti"]}", stored);   // the used refresh token
    }

    [Fact]
    public async Task ARefreshTokenCanBeUsedByExactlyOneOfManySimultaneousCallers()
    {
        var jti = Guid.NewGuid().ToString("N");

        var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Task.Run(async () =>
        {
            using var scope = fixture.Factory.Services.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<ICustomerSessions>().TryUseRefreshTokenAsync(jti, DateTimeOffset.UtcNow.AddDays(1), default);
        })));

        Assert.Equal(1, results.Count(r => r));
    }

    [Fact]
    public async Task EndingASessionTwice_IsHarmless()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var sessions = scope.ServiceProvider.GetRequiredService<ICustomerSessions>();
        var sid = Guid.NewGuid().ToString("N");

        await sessions.EndSessionAsync(sid, DateTimeOffset.UtcNow.AddDays(1), default);
        await sessions.EndSessionAsync(sid, DateTimeOffset.UtcNow.AddDays(1), default);
    }

    [Fact]
    public async Task TheSweeper_RemovesOnlyRecordsForTokensThatHaveExpiredAnyway()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var (expired, live) = ($"jti:{Guid.NewGuid():N}", $"jti:{Guid.NewGuid():N}");
        db.RevokedTokens.AddRange(
            new RevokedToken { TokenId = expired, ExpiresAt = DateTimeOffset.UtcNow.AddHours(-2) },
            new RevokedToken { TokenId = live, ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) });
        await db.SaveChangesAsync();

        await ExpiredRevocationsSweeper.SweepAsync(db, default);

        var remaining = await db.RevokedTokens.Where(r => r.TokenId == expired || r.TokenId == live).Select(r => r.TokenId).ToListAsync();
        Assert.Equal(new[] { live }, remaining);
    }
}
