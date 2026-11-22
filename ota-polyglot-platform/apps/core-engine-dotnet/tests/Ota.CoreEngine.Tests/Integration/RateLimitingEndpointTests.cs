using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.RateLimiting;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P3-3: the abuse limits on the anonymous consumer endpoints, with limiting switched ON. Each test uses addresses, references and
/// emails nobody else uses, because the counters live in Redis and outlast a test.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class RateLimitingEndpointTests(OtaCoreEngineFixture fixture)
{
    private readonly TestIdp _idp = new();
    private readonly FakeEmailSender _mail = new();
    private IRateLimiter? _limiterOverride;

    /// <summary>Sets the TCP peer address (default: a trusted, loopback peer), so tests can behave like a real proxy or like an untrusted caller.</summary>
    private sealed class PeerFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (ctx, nxt) =>
            {
                ctx.Connection.RemoteIpAddress = IPAddress.Parse(ctx.Request.Headers["X-Test-Peer"].FirstOrDefault() ?? "127.0.0.1");
                await nxt();
            });
            next(app);
        };
    }

    private WebApplicationFactory<Program> Build(bool limitsOn = true) => fixture.Factory.WithWebHostBuilder(b =>
    {
        b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["RateLimiting:Enabled"] = limitsOn ? "true" : "false" }));
        b.ConfigureServices(s =>
        {
            s.AddTransient<IStartupFilter, PeerFilter>();
            s.RemoveAll<IExternalIdentityVerifier>(); s.AddSingleton(_idp.Verifier());
            s.RemoveAll<IEmailSender>(); s.AddSingleton<IEmailSender>(_mail);
            if (_limiterOverride is not null) { s.RemoveAll<IRateLimiter>(); s.AddSingleton(_limiterOverride); }
        });
    });

    private static int _counter = (int)(Environment.TickCount64 % 200);
    /// <summary>An address no other test (or earlier run) has used.</summary>
    private static string NewIp() => $"100.{Random.Shared.Next(1, 254)}.{Random.Shared.Next(1, 254)}.{Interlocked.Increment(ref _counter) % 250 + 1}";
    private static string Pnr() => Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    private const string Guest = "/api/v1/guest/bookings";

    private static HttpClient As(WebApplicationFactory<Program> f, string tenant, string ip, string? peer = null)
    {
        var c = f.CreateClient();
        c.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        c.DefaultRequestHeaders.Add("X-Forwarded-For", ip);
        if (peer is not null) c.DefaultRequestHeaders.Add("X-Test-Peer", peer);
        return c;
    }

    private static Task<HttpResponseMessage> Lookup(HttpClient c, string reference, string surname) => c.PostAsJsonAsync($"{Guest}/lookup", new { reference, lastName = surname });

    // ------------------------------------------------------------------------------------------ guest lookup

    [Fact]
    public async Task AReferenceOnlyGetsAHandfulOfWrongSurnames_FromAnywhere_ThenIsLockedEvenForTheRightOne()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test", lastName: "Rahman");

        // five wrong guesses — from FIVE DIFFERENT addresses, so this is not an IP limit
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.NotFound, (await Lookup(As(f, tenant, NewIp()), pnr, $"guess{i}")).StatusCode);

        var locked = await Lookup(As(f, tenant, NewIp()), pnr, "Rahman"); // the RIGHT surname, a sixth address: still refused
        Assert.Equal(HttpStatusCode.TooManyRequests, locked.StatusCode);
        Assert.True(locked.Headers.RetryAfter is not null || locked.Headers.Contains("Retry-After"));
        var body = await locked.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("rate_limited", body.GetProperty("error").GetString());
        Assert.True(body.GetProperty("retryAfterSeconds").GetInt32() > 0);
    }

    [Fact]
    public async Task CorrectLookups_NeverCountTowardsTheFailureLimit()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test", lastName: "Rahman");

        for (var i = 0; i < 12; i++) // far more than the 5-failure limit
            Assert.Equal(HttpStatusCode.OK, (await Lookup(As(f, tenant, NewIp()), pnr, "Rahman")).StatusCode);
    }

    [Fact]
    public async Task LockingOneReference_DoesNotAffectAnother_OrAnotherTenantsSameReference()
    {
        var f = Build();
        var (tenantA, tenantB) = (await TestData.RegisterB2CTenantAsync(fixture.Factory), await TestData.RegisterB2CTenantAsync(fixture.Factory));
        var (pnr, other) = (Pnr(), Pnr());
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenantA, other, guestEmail: "g@example.test", lastName: "Rahman");
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenantB, pnr, guestEmail: "g@example.test", lastName: "Rahman");
        for (var i = 0; i < 5; i++) await Lookup(As(f, tenantA, NewIp()), pnr, "wrong");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Lookup(As(f, tenantA, NewIp()), pnr, "wrong")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await Lookup(As(f, tenantA, NewIp()), other, "Rahman")).StatusCode);   // another reference
        Assert.Equal(HttpStatusCode.OK, (await Lookup(As(f, tenantB, NewIp()), pnr, "Rahman")).StatusCode);     // same reference, another tenant
    }

    [Fact]
    public async Task OneAddress_GetsAFixedNumberOfLookups_ThenIsRefused_WhileOthersAreNot()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var ip = NewIp();
        var results = new List<HttpStatusCode>();
        for (var i = 0; i < 32; i++) results.Add((await Lookup(As(f, tenant, ip), Pnr(), "x")).StatusCode); // a fresh reference each time: no per-reference lock

        Assert.Equal(30, results.Count(r => r == HttpStatusCode.NotFound));
        Assert.Equal(2, results.Count(r => r == HttpStatusCode.TooManyRequests));
        Assert.Equal(HttpStatusCode.NotFound, (await Lookup(As(f, tenant, NewIp()), Pnr(), "x")).StatusCode); // a different address is untouched
    }

    // ------------------------------------------------------------------------------------------ send-link

    [Fact]
    public async Task SendLink_IsLimitedPerAddress_WithA429()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var ip = NewIp();

        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 7; i++) codes.Add((await As(f, tenant, ip).PostAsJsonAsync($"{Guest}/send-link", new { reference = Pnr(), email = $"{Guid.NewGuid():N}@example.test" })).StatusCode);

        Assert.Equal(5, codes.Count(c => c == HttpStatusCode.Accepted));
        Assert.Equal(2, codes.Count(c => c == HttpStatusCode.TooManyRequests));
    }

    [Fact]
    public async Task SendLink_CannotBeUsedToFloodOnePersonsInbox_AndTheLimitIsSilent()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        var email = $"{Guid.NewGuid():N}@example.test";
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: email);

        var bodies = new List<string>();
        for (var i = 0; i < 6; i++) // six requests, each from a DIFFERENT address, all naming the same booking and mailbox
        {
            var r = await As(f, tenant, NewIp()).PostAsJsonAsync($"{Guest}/send-link", new { reference = pnr, email });
            Assert.Equal(HttpStatusCode.Accepted, r.StatusCode);   // never a 429 or an error: the limit must not be observable
            bodies.Add(await r.Content.ReadAsStringAsync());
        }

        Assert.Equal(3, _mail.Sent.Count);        // the mailbox got three, not six
        Assert.Single(bodies.Distinct());          // and the caller cannot tell the difference
    }

    [Fact]
    public async Task OneMailbox_CannotBeFlooded_EvenAcrossManyDifferentBookings()
    {
        // Only the per-ADDRESS limit can stop this: every request names a different booking, so no per-booking limit is ever reached.
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = $"{Guid.NewGuid():N}@example.test";
        var references = new List<string>();
        for (var i = 0; i < 6; i++)
        {
            references.Add(Pnr());
            await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, references[i], guestEmail: email);
        }

        foreach (var reference in references)
            Assert.Equal(HttpStatusCode.Accepted, (await As(f, tenant, NewIp()).PostAsJsonAsync($"{Guest}/send-link", new { reference, email })).StatusCode);

        Assert.Equal(3, _mail.Sent.Count); // six bookings, one mailbox, three emails
    }

    [Fact]
    public async Task OneBooking_CannotBeUsedToFloodItsMailbox_WhateverAddressCaseIsUsed()
    {
        // The same address written five different ways must be ONE address to the limiter (keys are case- and whitespace-insensitive),
        // otherwise formatting alone would buy an attacker unlimited mails.
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "flood@example.test");

        foreach (var spelling in new[] { "flood@example.test", "FLOOD@example.test", "Flood@Example.Test", " flood@example.test ", "FLOOD@EXAMPLE.TEST" })
            await As(f, tenant, NewIp()).PostAsJsonAsync($"{Guest}/send-link", new { reference = pnr, email = spelling });

        Assert.Equal(3, _mail.Sent.Count);
    }

    // ------------------------------------------------------------------------------------------ sign-in

    [Fact]
    public async Task RepeatedInvalidSignIns_FromOneAddress_LockThatAddressOut_EvenForAGenuineToken()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var ip = NewIp();
        object Bad() => new { provider = "google", idToken = _idp.IdToken("x", audience: "another-app") };

        for (var i = 0; i < 10; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await As(f, tenant, ip).PostAsJsonAsync("/api/v1/auth/customer/social", Bad())).StatusCode);

        var genuine = new { provider = "google", idToken = _idp.IdToken(Guid.NewGuid().ToString("N"), "a@example.test", emailVerified: true) };
        Assert.Equal(HttpStatusCode.TooManyRequests, (await As(f, tenant, ip).PostAsJsonAsync("/api/v1/auth/customer/social", genuine)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await As(f, tenant, NewIp()).PostAsJsonAsync("/api/v1/auth/customer/social", genuine)).StatusCode); // someone else is fine
    }

    [Fact]
    public async Task SuccessfulSignIns_DoNotCountAsFailures()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var ip = NewIp();

        for (var i = 0; i < 15; i++) // more than the failure limit of 10, all genuine
            Assert.Equal(HttpStatusCode.OK, (await As(f, tenant, ip).PostAsJsonAsync("/api/v1/auth/customer/social",
                new { provider = "google", idToken = _idp.IdToken(Guid.NewGuid().ToString("N"), $"{Guid.NewGuid():N}@example.test", emailVerified: true) })).StatusCode);
    }

    [Fact]
    public async Task TheServiceTokenEndpoint_IsLimitedToo()
    {
        var f = Build();
        var ip = NewIp();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 32; i++)
            codes.Add((await As(f, "any", ip).PostAsJsonAsync("/api/v1/auth/service/token", new { clientId = "nobody", clientSecret = "x" })).StatusCode);

        Assert.Equal(30, codes.Count(c => c == HttpStatusCode.Unauthorized));
        Assert.Equal(2, codes.Count(c => c == HttpStatusCode.TooManyRequests));
    }

    // ------------------------------------------------------------------------------------------ where the client's address comes from

    [Fact]
    public async Task AnUntrustedCaller_CannotDodgeTheLimit_ByInventingXForwardedFor()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var peer = NewIp(); // a public address, NOT one of the trusted proxy networks

        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 7; i++) // a fresh forged address every time
            codes.Add((await As(f, tenant, NewIp(), peer).PostAsJsonAsync($"{Guest}/send-link", new { reference = Pnr(), email = $"{Guid.NewGuid():N}@example.test" })).StatusCode);

        Assert.Equal(2, codes.Count(c => c == HttpStatusCode.TooManyRequests)); // the forged headers were ignored; the real peer was counted
    }

    [Fact]
    public async Task ATrustedProxy_IsBelievedAboutWhoTheClientIs()
    {
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        // the same trusted proxy, forwarding two different clients: each has its own allowance
        for (var i = 0; i < 5; i++) await As(f, tenant, "198.51.100.77", peer: "10.1.2.3").PostAsJsonAsync($"{Guest}/send-link", new { reference = Pnr(), email = $"{Guid.NewGuid():N}@example.test" });
        // (198.51.100.77 above may be reused across runs; only the property "another client is unaffected" matters here)
        var other = await As(f, tenant, NewIp(), peer: "10.1.2.3").PostAsJsonAsync($"{Guest}/send-link", new { reference = Pnr(), email = $"{Guid.NewGuid():N}@example.test" });

        Assert.Equal(HttpStatusCode.Accepted, other.StatusCode);
    }

    // ------------------------------------------------------------------------------------------ switches and failure

    [Fact]
    public async Task WithLimitsOff_NothingIsThrottled()
    {
        var f = Build(limitsOn: false);
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var ip = NewIp();

        for (var i = 0; i < 40; i++)
            Assert.Equal(HttpStatusCode.NotFound, (await Lookup(As(f, tenant, ip), Pnr(), "x")).StatusCode);
    }

    private sealed class BrokenLimiter(Func<string, bool>? breaksFor = null) : IRateLimiter
    {
        private RateDecision Result(string bucket) => breaksFor is null || breaksFor(bucket) ? throw new InvalidOperationException("redis is down") : new(true, 1, TimeSpan.Zero);
        public Task<RateDecision> HitAsync(string bucket, string key, int limit, TimeSpan window, CancellationToken ct) => Task.FromResult(Result(bucket));
        public Task<RateDecision> PeekAsync(string bucket, string key, int limit, TimeSpan window, CancellationToken ct) => Task.FromResult(Result(bucket));
    }

    [Fact]
    public async Task WhenTheLimiterIsDown_RequestsAreRefusedNotWavedThrough()
    {
        _limiterOverride = new BrokenLimiter();
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test", lastName: "Rahman");

        var lookup = await Lookup(As(f, tenant, NewIp()), pnr, "Rahman"); // the RIGHT surname: it must still not be answered
        var sendLink = await As(f, tenant, NewIp()).PostAsJsonAsync($"{Guest}/send-link", new { reference = pnr, email = "g@example.test" });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, lookup.StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, sendLink.StatusCode);
        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task WhenOnlyThePerTargetLimiterIsDown_SendLinkSendsNothing_ButStillAnswersAsUsual()
    {
        _limiterOverride = new BrokenLimiter(bucket => bucket is "send-link-email" or "send-link-ref");
        var f = Build();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test");

        var response = await As(f, tenant, NewIp()).PostAsJsonAsync($"{Guest}/send-link", new { reference = pnr, email = "g@example.test" });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Empty(_mail.Sent); // fails closed, quietly: no mail without a working limiter
    }
}
