using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P3-2 over HTTP: the storefront's "manage booking" page, the emailed link, and a guest booking joining an account at sign-in.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class GuestBookingsEndpointTests(OtaCoreEngineFixture fixture)
{
    private readonly TestIdp _idp = new();
    private readonly FakeEmailSender _mail = new();
    private WebApplicationFactory<Program>? _factory;

    private WebApplicationFactory<Program> Factory => _factory ??= fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
    {
        s.RemoveAll<IExternalIdentityVerifier>(); s.AddSingleton(_idp.Verifier());
        s.RemoveAll<IEmailSender>(); s.AddSingleton<IEmailSender>(_mail);
    }));

    private HttpClient Client(string? tenant, string? bearer = null)
    {
        var c = Factory.CreateClient();
        if (tenant is not null) c.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        if (bearer is not null) c.DefaultRequestHeaders.Authorization = new("Bearer", bearer);
        return c;
    }

    private static string Pnr() => Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    private const string Base = "/api/v1/guest/bookings";

    private async Task<string> IssueTokenAsync(string tenant, Booking booking)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        return await scope.ServiceProvider.GetRequiredService<Ota.CoreEngine.Bookings.IGuestAccessService>().IssueClaimTokenAsync(booking, null, default);
    }

    // ------------------------------------------------------------------------------------------ lookup and access

    [Fact]
    public async Task ALookup_ReturnsTheNarrowView_AndNothingSensitive()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test");

        var response = await Client(tenant).PostAsJsonAsync($"{Base}/lookup", new { reference = pnr, lastName = "rahman" });
        var raw = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonDocument.Parse(raw).RootElement;
        Assert.Equal((pnr, "Confirmed", 250m, "BDT"), (body.GetProperty("reference").GetString(), body.GetProperty("status").GetString(), body.GetProperty("total").GetDecimal(), body.GetProperty("currency").GetString()));
        Assert.Equal("Sam", body.GetProperty("travelers")[0].GetProperty("firstName").GetString());
        foreach (var secret in new[] { "P9999999", "PASSPORT", "SUPPLIER-SECRET-REF", "SupplierNetRate", "g@example.test" }) Assert.DoesNotContain(secret, raw);
    }

    [Fact]
    public async Task EveryWayOfNotFindingABooking_LooksIdentical_SoNothingCanBeLearnedFromTheAnswer()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test");
        // an agent's booking in the SAME tenant, same surname: only the channel check keeps it from being found
        var b2bPnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, b2bPnr, channel: BookingChannels.B2BAgent, agentId: Guid.NewGuid());

        var answers = new List<(HttpStatusCode, string)>();
        foreach (var (client, body) in new (HttpClient, object)[]
                 {
                     (Client(tenant), new { reference = pnr, lastName = "wrong" }),          // right booking, wrong surname
                     (Client(tenant), new { reference = "ZZZZZZ", lastName = "rahman" }),    // no such booking
                     (Client(tenant), new { reference = "", lastName = "rahman" }),          // nothing given
                     (Client(tenant), new { reference = b2bPnr, lastName = "rahman" }),      // exists, but is an agent's
                 })
        {
            var r = await client.PostAsJsonAsync($"{Base}/lookup", body);
            answers.Add((r.StatusCode, await r.Content.ReadAsStringAsync()));
        }

        Assert.All(answers, a => Assert.Equal(HttpStatusCode.NotFound, a.Item1));
        Assert.Single(answers.Select(a => a.Item2).Distinct());
    }

    [Fact]
    public async Task ATokenFromAnEmailedLink_OpensItsBooking_AndAJunkOrExpiredOneGetsTheSameNotFound()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "g@example.test");
        var token = await IssueTokenAsync(tenant, booking);

        var ok = await Client(tenant).PostAsJsonAsync($"{Base}/access", new { claimToken = token });
        var junk = await Client(tenant).PostAsJsonAsync($"{Base}/access", new { claimToken = "junk" });
        var missing = await Client(tenant).PostAsJsonAsync($"{Base}/access", new { claimToken = (string?)null });

        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(booking.Pnr, (await ok.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("reference").GetString());
        Assert.Equal((HttpStatusCode.NotFound, HttpStatusCode.NotFound), (junk.StatusCode, missing.StatusCode));
        Assert.Equal(await junk.Content.ReadAsStringAsync(), await missing.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task OnlyARegisteredActiveB2CStorefront_MayBeAskedAboutBookings()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test");
        var inactive = await TestData.RegisterB2CTenantAsync(fixture.Factory, active: false);

        foreach (var endpoint in new[] { "lookup", "access", "send-link", "cancel" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await Client("no-such-tenant").PostAsJsonAsync($"{Base}/{endpoint}", new { reference = pnr, lastName = "rahman", claimToken = "x", email = "g@example.test", bookingId = Guid.NewGuid() })).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await Client(inactive).PostAsJsonAsync($"{Base}/{endpoint}", new { reference = pnr, lastName = "rahman", claimToken = "x", email = "g@example.test", bookingId = Guid.NewGuid() })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await Client(null).PostAsJsonAsync($"{Base}/{endpoint}", new { reference = pnr })).StatusCode); // no tenant header
        }
    }

    [Fact]
    public async Task ABookingIsNotVisibleThroughAnotherTenantsStorefront()
    {
        var (tenantA, tenantB) = (await TestData.RegisterB2CTenantAsync(fixture.Factory), await TestData.RegisterB2CTenantAsync(fixture.Factory));
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenantA, pnr, guestEmail: "g@example.test");

        Assert.Equal(HttpStatusCode.NotFound, (await Client(tenantB).PostAsJsonAsync($"{Base}/lookup", new { reference = pnr, lastName = "rahman" })).StatusCode);
    }

    // ------------------------------------------------------------------------------------------ "email me a link"

    [Fact]
    public async Task SendLink_EmailsAWorkingLink_WhenTheBookingAndAddressMatch()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "Guest@Example.test");

        var response = await Client(tenant).PostAsJsonAsync($"{Base}/send-link", new { reference = pnr.ToLowerInvariant(), email = "  guest@example.TEST " });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var mail = Assert.Single(_mail.Sent);
        Assert.Equal("guest@example.TEST", mail.To);
        Assert.Contains(pnr, mail.Subject);
        // the token is in the URL FRAGMENT (never sent to a server), on the tenant's own storefront host
        var link = mail.Body.Split('\n', StringSplitOptions.TrimEntries).Single(l => l.StartsWith("https://"));
        Assert.Contains(".b2c.example.test/manage-booking#claim=", link);
        Assert.DoesNotContain("?", link);

        var token = link[(link.IndexOf("#claim=", StringComparison.Ordinal) + "#claim=".Length)..];
        var opened = await Client(tenant).PostAsJsonAsync($"{Base}/access", new { claimToken = token });
        Assert.Equal(HttpStatusCode.OK, opened.StatusCode);
        Assert.Equal(booking.Pnr, (await opened.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("reference").GetString());
    }

    [Fact]
    public async Task SendLink_AlwaysAnswersTheSame_SoItCannotRevealWhoseBookingsExist()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test");

        var matching = await Client(tenant).PostAsJsonAsync($"{Base}/send-link", new { reference = pnr, email = "g@example.test" });
        var wrongEmail = await Client(tenant).PostAsJsonAsync($"{Base}/send-link", new { reference = pnr, email = "other@example.test" });
        var noSuchBooking = await Client(tenant).PostAsJsonAsync($"{Base}/send-link", new { reference = "ZZZZZZ", email = "g@example.test" });
        var junk = await Client(tenant).PostAsJsonAsync($"{Base}/send-link", new { reference = (string?)null, email = (string?)null });

        var bodies = new[] { matching, wrongEmail, noSuchBooking, junk };
        Assert.All(bodies, r => Assert.Equal(HttpStatusCode.Accepted, r.StatusCode));
        Assert.Single((await Task.WhenAll(bodies.Select(r => r.Content.ReadAsStringAsync()))).Distinct());
        Assert.Single(_mail.Sent); // …but mail went only to the matching one
    }

    [Fact]
    public async Task SendLink_NeverMailsForAnAgentsBooking()
    {
        var (tenant, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var b2c = await TestData.RegisterB2CTenantAsync(fixture.Factory, tenant);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, b2c, pnr, channel: BookingChannels.B2BAgent, agentId: agentId, guestEmail: null);
        using (var scope = TestData.CreateTenantScope(fixture.Factory, b2c))
            await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings.Where(b => b.Pnr == pnr).ExecuteUpdateAsync(s => s.SetProperty(b => b.CustomerEmail, "agentclient@example.test"));

        await Client(b2c).PostAsJsonAsync($"{Base}/send-link", new { reference = pnr, email = "agentclient@example.test" });

        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task ABrokenMailServer_DoesNotBecomeASignal()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test");
        _mail.Fail = true;

        var response = await Client(tenant).PostAsJsonAsync($"{Base}/send-link", new { reference = pnr, email = "g@example.test" });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode); // same answer as when it works
    }

    // ------------------------------------------------------------------------------------------ joining an account

    private async Task<JsonElement> SignInAsync(string tenant, string sub, string email)
    {
        var r = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", new { provider = "google", idToken = _idp.IdToken(sub, email, emailVerified: true) });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task SigningInWithAVerifiedEmail_PullsInTheGuestBookingsMadeWithIt_AndTheyAppearInMyBookings()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var mine = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "sam@example.test");
        var notMine = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "someone.else@example.test");

        var session = await SignInAsync(tenant, "join-1", "sam@example.test");

        Assert.Equal(1, session.GetProperty("attachedGuestBookings").GetInt32());
        var list = await Client(tenant, session.GetProperty("accessToken").GetString()).GetFromJsonAsync<JsonElement[]>("/api/v1/customers/me/bookings");
        Assert.Equal(new[] { mine.Pnr }, list!.Select(b => b.GetProperty("reference").GetString()));
        Assert.DoesNotContain(notMine.Pnr, list!.Select(b => b.GetProperty("reference").GetString()));
    }

    [Fact]
    public async Task AnUnverifiedEmail_PullsInNothing()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "victim@example.test");

        // an attacker's provider account CLAIMS the victim's address but the provider did not verify it
        var r = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", new { provider = "google", idToken = _idp.IdToken("attacker", "victim@example.test", emailVerified: false) });
        var session = await r.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(0, session.GetProperty("attachedGuestBookings").GetInt32());
        var mine = await Client(tenant, session.GetProperty("accessToken").GetString()).GetFromJsonAsync<JsonElement[]>("/api/v1/customers/me/bookings");
        Assert.Empty(mine!);
    }

    [Fact]
    public async Task MyBookings_ListsOnlyTheSignedInCustomersOwn_NotAnotherCustomersInTheSameTenant()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "alice@example.test");
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "bob@example.test");
        var alice = await SignInAsync(tenant, "alice", "alice@example.test");
        var bob = await SignInAsync(tenant, "bob", "bob@example.test");

        var aliceList = await Client(tenant, alice.GetProperty("accessToken").GetString()).GetFromJsonAsync<JsonElement[]>("/api/v1/customers/me/bookings");
        var bobList = await Client(tenant, bob.GetProperty("accessToken").GetString()).GetFromJsonAsync<JsonElement[]>("/api/v1/customers/me/bookings");

        Assert.Single(aliceList!);
        Assert.Single(bobList!);
        Assert.NotEqual(aliceList![0].GetProperty("reference").GetString(), bobList![0].GetProperty("reference").GetString());
    }

    [Fact]
    public async Task ASignedInCustomer_CanClaimAGuestBookingWithItsToken_ButNotOneThatBelongsToSomeoneElse()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var guest = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "elsewhere@example.test"); // a different address: not auto-attached
        var token = await IssueTokenAsync(tenant, guest);
        var claimer = await SignInAsync(tenant, "claimer", "claimer@example.test");
        var late = await SignInAsync(tenant, "latecomer", "late@example.test");
        var bearer = claimer.GetProperty("accessToken").GetString();

        var claim = await Client(tenant, bearer).PostAsJsonAsync("/api/v1/customers/me/bookings/claim", new { claimToken = token });
        var lateClaim = await Client(tenant, late.GetProperty("accessToken").GetString()).PostAsJsonAsync("/api/v1/customers/me/bookings/claim", new { claimToken = token });
        var junk = await Client(tenant, bearer).PostAsJsonAsync("/api/v1/customers/me/bookings/claim", new { claimToken = "junk" });

        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);
        Assert.True((await claim.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("claimed").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, lateClaim.StatusCode); // already belongs to the first customer
        Assert.Equal(HttpStatusCode.NotFound, junk.StatusCode);
        Assert.Single((await Client(tenant, bearer).GetFromJsonAsync<JsonElement[]>("/api/v1/customers/me/bookings"))!);
    }

    [Fact]
    public async Task TheCustomerOnlyEndpoints_RefuseAnAgentToken_AndNoToken()
    {
        var (tenant, _, agentToken) = await TestData.SeedAgentAsync(fixture.Factory);

        foreach (var (method, url) in new[] { ("GET", "/api/v1/customers/me/bookings"), ("POST", "/api/v1/customers/me/bookings/claim") })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, agentToken).SendAsync(new HttpRequestMessage(new HttpMethod(method), url) { Content = JsonContent.Create(new { claimToken = "x" }) })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant).SendAsync(new HttpRequestMessage(new HttpMethod(method), url) { Content = JsonContent.Create(new { claimToken = "x" }) })).StatusCode);
        }
    }
}
