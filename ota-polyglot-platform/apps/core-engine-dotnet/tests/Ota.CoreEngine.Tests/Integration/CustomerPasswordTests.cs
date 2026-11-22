using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>Email + password accounts for consumers, next to Google: what a customer can do, and — as important — what a stranger cannot.
/// Runs with the abuse limits ON (each test uses its own tenant, address and client IP, since counters outlive a test).</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CustomerPasswordTests(OtaCoreEngineFixture fixture)
{
    private const string Good = "correct horse battery";
    private readonly TestIdp _idp = new();
    private readonly FakeEmailSender _mail = new();
    private WebApplicationFactory<Program>? _factory;

    private sealed class PeerFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (ctx, nxt) => { ctx.Connection.RemoteIpAddress = IPAddress.Loopback; await nxt(); });
            next(app);
        };
    }

    private WebApplicationFactory<Program> Factory => _factory ??= fixture.Factory.WithWebHostBuilder(b =>
    {
        b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["RateLimiting:Enabled"] = "true", ["STOREFRONT_PUBLIC_URL"] = "https://shop.example.test" }));
        b.ConfigureServices(s =>
        {
            s.AddTransient<IStartupFilter, PeerFilter>();
            s.RemoveAll<IEmailSender>(); s.AddSingleton<IEmailSender>(_mail);
            s.RemoveAll<IExternalIdentityVerifier>(); s.AddSingleton(_idp.Verifier());
        });
    });

    private static int _ip = (int)(Environment.TickCount64 % 200);
    private static string NewIp() => $"100.{Random.Shared.Next(1, 254)}.{Random.Shared.Next(1, 254)}.{Interlocked.Increment(ref _ip) % 250 + 1}";
    private static string NewEmail() => $"pw-{Guid.NewGuid():N}@Example.test";

    private HttpClient Client(string tenant, string? ip = null, string? bearer = null)
    {
        var c = Factory.CreateClient();
        c.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        c.DefaultRequestHeaders.Add("X-Forwarded-For", ip ?? NewIp());
        if (bearer is not null) c.DefaultRequestHeaders.Authorization = new("Bearer", bearer);
        return c;
    }

    private const string Base = "/api/v1/auth/customer";
    private const string Phone = "+880 01712345678";
    private Task<HttpResponseMessage> Register(string tenant, string email, string password = Good, string? first = "Sam", string? last = "Rahman", string? ip = null, string? phone = Phone) =>
        Client(tenant, ip).PostAsJsonAsync($"{Base}/register", new { email, password, phone, firstName = first, lastName = last });
    private Task<HttpResponseMessage> Login(string tenant, string email, string password, string? ip = null) =>
        Client(tenant, ip).PostAsJsonAsync($"{Base}/login", new { email, password });

    private string TokenFrom(string to, string path)
    {
        var mail = _mail.Sent.Last(m => string.Equals(m.To, to, StringComparison.OrdinalIgnoreCase) && m.Body.Contains(path));
        var m2 = Regex.Match(mail.Body, Regex.Escape(path) + @"#token=([A-Za-z0-9_-]+)");
        Assert.True(m2.Success, mail.Body);
        return m2.Groups[1].Value;
    }

    private async Task<T> DbAsync<T>(string tenant, Func<OtaDbContext, Task<T>> q)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        return await q(scope.ServiceProvider.GetRequiredService<OtaDbContext>());
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    // ------------------------------------------------------------------------------------------ registering

    [Fact]
    public async Task ARegistration_NeedsNoName_KeepsTheOptionalPhone_SignsTheCustomerIn_AndAsksThemToConfirmTheAddress()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();

        var response = await Register(tenant, email, first: null, last: null);
        var body = await Json(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(email.ToLowerInvariant(), body.GetProperty("customer").GetProperty("email").GetString());
        Assert.Equal(Phone, body.GetProperty("customer").GetProperty("phone").GetString());
        Assert.False(body.GetProperty("customer").GetProperty("emailVerified").GetBoolean());          // unconfirmed until the link is opened
        Assert.True(body.GetProperty("isNewCustomer").GetBoolean());
        var me = await Client(tenant, bearer: body.GetProperty("accessToken").GetString()).GetAsync("/api/v1/customers/me");   // signed in at once
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var mail = Assert.Single(_mail.Sent, m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase));
        Assert.Contains("https://shop.example.test/verify-email#token=", mail.Body);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public async Task ThePhoneIsOptional(string? phone)
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        var response = await Register(tenant, NewEmail(), phone: phone);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await Json(response)).GetProperty("customer").GetProperty("phone").ValueKind);
    }

    [Theory]
    [InlineData("01712345678")]
    [InlineData("+880 12")]
    public async Task ABadPhone_IsRefused_AndNothingIsCreated(string? phone)
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();

        var response = await Register(tenant, email, phone: phone);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, await DbAsync(tenant, db => db.Customers.CountAsync()));
    }

    [Theory]
    [InlineData("short")]
    [InlineData("        ")]
    [InlineData("")]
    public async Task AWeakPassword_IsRefused_AndNothingIsCreated(string password)
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();

        var response = await Register(tenant, email, password);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, await DbAsync(tenant, db => db.Customers.CountAsync()));
        Assert.DoesNotContain(_mail.Sent, m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task ThePasswordCannotBeTheEmailAddress_NorBeLongerThanBcryptReads()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = $"same-{Guid.NewGuid():N}@example.test";

        Assert.Equal(HttpStatusCode.BadRequest, (await Register(tenant, email, email)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Register(tenant, NewEmail(), new string('a', 73))).StatusCode);   // BCrypt ignores byte 73 on: refuse, don't truncate
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("")]
    public async Task ABadEmail_IsRefused(string email)
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.BadRequest, (await Register(tenant, email)).StatusCode);
    }

    [Fact]
    public async Task AnAddressThatAlreadyHasAnAccount_CannotBeRegisteredAgain_InAnyCase()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);

        var again = await Register(tenant, email.ToUpperInvariant(), "another password entirely");

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("email_taken", (await Json(again)).GetProperty("error").GetString());
        Assert.Equal(1, await DbAsync(tenant, db => db.Customers.CountAsync()));
    }

    [Fact]
    public async Task AGoogleAccounts_Address_CannotBeRegisteredWithAPassword_ByAStranger()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Client(tenant).PostAsJsonAsync($"{Base}/social", new { provider = "google", idToken = _idp.IdToken("g-owner-" + Guid.NewGuid().ToString("N"), email.ToLowerInvariant(), emailVerified: true) });

        var stranger = await Register(tenant, email, "the attackers own password");

        Assert.Equal(HttpStatusCode.Conflict, stranger.StatusCode);
        Assert.Equal(0, await DbAsync(tenant, db => db.CustomerIdentities.CountAsync(i => i.Provider == "password")));
    }

    [Fact]
    public async Task ThePasswordIsStoredHashed_NeverAsTyped()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);

        var stored = await DbAsync(tenant, db => db.CustomerIdentities.Where(i => i.Provider == "password").Select(i => i.PasswordHash).SingleAsync());

        Assert.DoesNotContain(Good, stored);
        Assert.StartsWith("$2", stored);   // BCrypt
    }

    // ------------------------------------------------------------------------------------------ signing in

    [Fact]
    public async Task ARegisteredCustomer_CanSignInWithThePassword_AnyCaseOfTheAddress()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);

        var response = await Login(tenant, email.ToUpperInvariant(), Good);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False((await Json(response)).GetProperty("isNewCustomer").GetBoolean());
    }

    [Fact]
    public async Task AWrongPassword_ANoSuchAddress_AndASuspendedAccount_AreIndistinguishable()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        var suspended = NewEmail();
        await Register(tenant, email);
        await Register(tenant, suspended);
        await DbAsync(tenant, db => db.Customers.Where(c => c.Email == suspended.ToLowerInvariant()).ExecuteUpdateAsync(s => s.SetProperty(c => c.IsActive, false)));

        var wrong = await Login(tenant, email, "not the password");
        var nobody = await Login(tenant, NewEmail(), Good);
        var suspendedTryingRightPassword = await Login(tenant, suspended, Good);

        Assert.All(new[] { wrong, nobody, suspendedTryingRightPassword }, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
        var bodies = new[] { await wrong.Content.ReadAsStringAsync(), await nobody.Content.ReadAsStringAsync(), await suspendedTryingRightPassword.Content.ReadAsStringAsync() };
        Assert.Single(bodies.Distinct());   // same words, so the answer teaches an attacker nothing
    }

    [Fact]
    public async Task APasswordAccountCannotBeEnteredWithAGoogleTokenForTheSameAddress_AndViceVersa()
    {
        // an UNconfirmed password account holds the address; a Google sign-in for that address does not take it over or link to it
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);

        var google = await Client(tenant).PostAsJsonAsync($"{Base}/social", new { provider = "google", idToken = _idp.IdToken("g-" + Guid.NewGuid().ToString("N"), email.ToLowerInvariant(), emailVerified: true) });
        var body = await Json(google);

        Assert.Equal(HttpStatusCode.OK, google.StatusCode);
        Assert.True(body.GetProperty("isNewCustomer").GetBoolean());                          // a separate customer, not the password one
        Assert.Equal(JsonValueKind.Null, body.GetProperty("customer").GetProperty("email").ValueKind);   // and it did not steal the address
        Assert.Equal(HttpStatusCode.OK, (await Login(tenant, email, Good)).StatusCode);       // the password account is untouched
    }

    [Fact]
    public async Task RepeatedWrongPasswords_ForOneAddress_LockItForAWhile_FromAnyAddress_ButNotOtherAddresses()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        var other = NewEmail();
        await Register(tenant, email);
        await Register(tenant, other);

        for (var i = 0; i < 8; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(tenant, email, "wrong " + i)).StatusCode);   // eight different client addresses

        var lockedOut = await Login(tenant, email, Good);                                    // even the RIGHT password, from a new address
        Assert.Equal(HttpStatusCode.TooManyRequests, lockedOut.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(tenant, other, Good)).StatusCode);      // an unrelated customer is unaffected
    }

    [Fact]
    public async Task OneClientGuessingAtManyAddresses_IsStopped()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var ip = NewIp();

        for (var i = 0; i < 10; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(tenant, NewEmail(), "guess", ip)).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login(tenant, NewEmail(), "guess", ip)).StatusCode);
    }

    [Fact]
    public async Task ANonStorefrontTenant_CannotRegisterOrSignIn()
    {
        var (agentTenant, _, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.NotFound, (await Register(agentTenant, NewEmail())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Login(agentTenant, NewEmail(), Good)).StatusCode);
    }

    [Fact]
    public async Task ACustomerToken_IsForCustomers_AnAgentsLoginDoesNotWorkHere()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        var body = await Json(await Register(tenant, email));

        var access = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(body.GetProperty("accessToken").GetString());

        Assert.Equal(TokenAudiences.Customers, access.Audiences.Single());
        Assert.Equal("customer", access.Claims.Single(c => c.Type == Ota.CoreEngine.SharedKernel.ActorTypes.ClaimName).Value);
    }

    // ------------------------------------------------------------------------------------------ confirming the address

    [Fact]
    public async Task OpeningTheConfirmationLink_ConfirmsTheAddress_OnceOnly()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);
        var token = TokenFrom(email, "/verify-email");

        var first = await Client(tenant).PostAsJsonAsync($"{Base}/verify-email", new { token });
        var second = await Client(tenant).PostAsJsonAsync($"{Base}/verify-email", new { token });

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);      // single use
        Assert.True(await DbAsync(tenant, db => db.Customers.Select(c => c.EmailVerified).SingleAsync()));
    }

    [Theory]
    [InlineData("")]
    [InlineData("nonsense")]
    public async Task AnUnknownConfirmationToken_IsRefused(string token)
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.BadRequest, (await Client(tenant).PostAsJsonAsync($"{Base}/verify-email", new { token })).StatusCode);
    }

    [Fact]
    public async Task AnExpiredConfirmationLink_IsRefused()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);
        var token = TokenFrom(email, "/verify-email");
        await DbAsync(tenant, db => db.CustomerEmailTokens.ExecuteUpdateAsync(s => s.SetProperty(t => t.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1))));

        Assert.Equal(HttpStatusCode.BadRequest, (await Client(tenant).PostAsJsonAsync($"{Base}/verify-email", new { token })).StatusCode);
        Assert.False(await DbAsync(tenant, db => db.Customers.Select(c => c.EmailVerified).SingleAsync()));
    }

    [Fact]
    public async Task ATokenStoredInTheDatabase_IsOnlyAHash_SoTheTableIsNotACredential()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);
        var token = TokenFrom(email, "/verify-email");

        var stored = await DbAsync(tenant, db => db.CustomerEmailTokens.Select(t => t.TokenHash).SingleAsync());

        Assert.NotEqual(token, stored);
        Assert.Matches("^[0-9a-f]{64}$", stored);
    }

    [Fact]
    public async Task GuestBookingsJoinTheAccountOnlyOnceTheAddressIsConfirmed_NotOnRegistering()
    {
        // The attack this stops: register with a VICTIM's address (no need to own the mailbox), then read the victim's guest bookings.
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        var pnr = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: email.ToLowerInvariant());

        var registered = await Json(await Register(tenant, email));
        var mineBefore = await Client(tenant, bearer: registered.GetProperty("accessToken").GetString()).GetFromJsonAsync<JsonElement>("/api/v1/customers/me/bookings");
        Assert.Equal(0, mineBefore.GetArrayLength());
        Assert.Equal(0, registered.GetProperty("attachedGuestBookings").GetInt32());

        await Client(tenant).PostAsJsonAsync($"{Base}/verify-email", new { token = TokenFrom(email, "/verify-email") });   // the real owner clicks the link
        var signedIn = await Json(await Login(tenant, email, Good));
        var mineAfter = await Client(tenant, bearer: signedIn.GetProperty("accessToken").GetString()).GetFromJsonAsync<JsonElement>("/api/v1/customers/me/bookings");

        Assert.Equal(1, mineAfter.GetArrayLength());
    }

    [Fact]
    public async Task ASignedInCustomer_CanAskForTheConfirmationEmailAgain_ALimitedNumberOfTimes()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        var access = (await Json(await Register(tenant, email))).GetProperty("accessToken").GetString();
        var before = _mail.Sent.Count;

        var first = await Client(tenant, bearer: access).PostAsync("/api/v1/customers/me/resend-verification", null);

        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);
        Assert.Equal(before + 1, _mail.Sent.Count);
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++) codes.Add((await Client(tenant, bearer: access).PostAsync("/api/v1/customers/me/resend-verification", null)).StatusCode);
        Assert.Contains(HttpStatusCode.TooManyRequests, codes);
    }

    // ------------------------------------------------------------------------------------------ forgot / reset

    [Fact]
    public async Task ForgotPassword_AnswersTheSame_ForAKnownAndAnUnknownAddress_AndMailsOnlyTheKnownOne()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var known = NewEmail();
        var unknown = NewEmail();
        await Register(tenant, known);
        var before = _mail.Sent.Count;

        var a = await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email = known });
        var b = await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email = unknown });

        Assert.Equal((HttpStatusCode.Accepted, HttpStatusCode.Accepted), (a.StatusCode, b.StatusCode));
        Assert.Equal(await a.Content.ReadAsStringAsync(), await b.Content.ReadAsStringAsync());
        Assert.Equal(before + 1, _mail.Sent.Count);
        Assert.Contains(_mail.Sent.Skip(before), m => m.To.Equals(known, StringComparison.OrdinalIgnoreCase) && m.Body.Contains("/reset-password#token="));
        Assert.DoesNotContain(_mail.Sent, m => m.To.Equals(unknown, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task ForgotPassword_CannotBeUsedToFillSomeonesInbox()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var victim = NewEmail();
        await Register(tenant, victim);
        var before = _mail.Sent.Count;

        for (var i = 0; i < 6; i++) Assert.Equal(HttpStatusCode.Accepted, (await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email = victim })).StatusCode);

        Assert.Equal(before + 3, _mail.Sent.Count);   // three per hour, silently; the caller still sees 202 every time
    }

    [Fact]
    public async Task ResettingThePassword_SetsIt_KillsTheOldOne_EndsEverySession_AndTheLinkWorksOnce()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        var oldSession = (await Json(await Register(tenant, email))).GetProperty("accessToken").GetString();
        Assert.Equal(HttpStatusCode.OK, (await Client(tenant, bearer: oldSession).GetAsync("/api/v1/customers/me")).StatusCode);
        await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email });
        var token = TokenFrom(email, "/reset-password");

        var reset = await Client(tenant).PostAsJsonAsync($"{Base}/reset-password", new { token, password = "a brand new passphrase" });
        var reuse = await Client(tenant).PostAsJsonAsync($"{Base}/reset-password", new { token, password = "and another passphrase" });

        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, reuse.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(tenant, email, Good)).StatusCode);                        // the old password is dead
        Assert.Equal(HttpStatusCode.OK, (await Login(tenant, email, "a brand new passphrase")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, bearer: oldSession).GetAsync("/api/v1/customers/me")).StatusCode);   // whoever was in is out
        Assert.True(await DbAsync(tenant, db => db.Customers.Select(c => c.EmailVerified).SingleAsync()));                // the link proved the mailbox
    }

    [Fact]
    public async Task ATypoInTheNewPassword_DoesNotUseUpTheLink()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);
        await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email });
        var token = TokenFrom(email, "/reset-password");

        var weak = await Client(tenant).PostAsJsonAsync($"{Base}/reset-password", new { token, password = "short" });
        var good = await Client(tenant).PostAsJsonAsync($"{Base}/reset-password", new { token, password = "a proper new passphrase" });

        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, good.StatusCode);
    }

    [Fact]
    public async Task AResetLink_DoesNotWorkAsAConfirmationLink_OrTheOtherWayRound()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);
        await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email });
        var reset = TokenFrom(email, "/reset-password");
        var verify = TokenFrom(email, "/verify-email");

        Assert.Equal(HttpStatusCode.BadRequest, (await Client(tenant).PostAsJsonAsync($"{Base}/verify-email", new { token = reset })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Client(tenant).PostAsJsonAsync($"{Base}/reset-password", new { token = verify, password = "a proper new passphrase" })).StatusCode);
    }

    [Fact]
    public async Task ACustomerWhoOnlyHadGoogle_CanAddAPassword_ThroughTheResetLink()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Client(tenant).PostAsJsonAsync($"{Base}/social", new { provider = "google", idToken = _idp.IdToken("g-" + Guid.NewGuid().ToString("N"), email.ToLowerInvariant(), emailVerified: true) });
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(tenant, email, Good)).StatusCode);   // no password yet

        await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email });
        var token = TokenFrom(email, "/reset-password");
        await Client(tenant).PostAsJsonAsync($"{Base}/reset-password", new { token, password = Good });

        var login = await Login(tenant, email, Good);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.False((await Json(login)).GetProperty("isNewCustomer").GetBoolean());   // the same customer, now with two ways in
        Assert.Equal(1, await DbAsync(tenant, db => db.Customers.CountAsync()));
    }

    [Fact]
    public async Task AnExpiredResetLink_IsRefused()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Register(tenant, email);
        await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email });
        var token = TokenFrom(email, "/reset-password");
        await DbAsync(tenant, db => db.CustomerEmailTokens.Where(t => t.Purpose == "reset").ExecuteUpdateAsync(s => s.SetProperty(t => t.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1))));

        Assert.Equal(HttpStatusCode.BadRequest, (await Client(tenant).PostAsJsonAsync($"{Base}/reset-password", new { token, password = "a proper new passphrase" })).StatusCode);
    }
}
