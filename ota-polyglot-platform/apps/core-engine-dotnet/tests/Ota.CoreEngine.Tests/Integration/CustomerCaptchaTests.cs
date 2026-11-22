using System.Net;
using System.Net.Http.Json;
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
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>The "are you a person?" check on the password endpoints, and the common-password rule at the door. The check is a stand-in that
/// accepts the token "human" and nothing else; the real Turnstile call is checked separately below.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CustomerCaptchaTests(OtaCoreEngineFixture fixture)
{
    private const string Good = "correct horse battery";
    private const string Base = "/api/v1/auth/customer";
    private readonly FakeEmailSender _mail = new();
    private WebApplicationFactory<Program>? _factory;

    private sealed class FakeCaptcha : ICaptchaVerifier
    {
        public bool IsEnabled => true;
        public Task<bool> VerifyAsync(string? token, string? clientIp, CancellationToken ct) => Task.FromResult(token == "human");
    }

    private sealed class PeerFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (ctx, nxt) => { ctx.Connection.RemoteIpAddress = System.Net.IPAddress.Loopback; await nxt(); });
            next(app);
        };
    }

    private WebApplicationFactory<Program> Factory => _factory ??= fixture.Factory.WithWebHostBuilder(b =>
    {
        b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["RateLimiting:Enabled"] = "true" }));
        b.ConfigureServices(s =>
        {
            s.AddTransient<IStartupFilter, PeerFilter>();
            s.RemoveAll<IEmailSender>(); s.AddSingleton<IEmailSender>(_mail);
            s.RemoveAll<ICaptchaVerifier>(); s.AddSingleton<ICaptchaVerifier>(new FakeCaptcha());
        });
    });

    private static int _ip = (int)(Environment.TickCount64 % 200);
    private static string NewIp() => $"100.{Random.Shared.Next(1, 254)}.{Random.Shared.Next(1, 254)}.{Interlocked.Increment(ref _ip) % 250 + 1}";
    private static string NewEmail() => $"cap-{Guid.NewGuid():N}@example.test";

    private HttpClient Client(string tenant, string? ip = null)
    {
        var c = Factory.CreateClient();
        c.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        c.DefaultRequestHeaders.Add("X-Forwarded-For", ip ?? NewIp());
        return c;
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage r) => (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString();

    // ------------------------------------------------------------------------------------------ common passwords, end to end

    [Theory]
    [InlineData("password123")]
    [InlineData("12345678")]
    [InlineData("qwertyuiop")]
    public async Task RegisteringWithACommonPassword_IsRefused_WithWordsThatSayWhatToDo(string password)
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        var response = await Client(tenant).PostAsJsonAsync($"{Base}/register", new { email = NewEmail(), password, phone = "+880 01712345678", firstName = "Sam", captchaToken = "human" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("easy to guess", await response.Content.ReadAsStringAsync());
    }

    // ------------------------------------------------------------------------------------------ registering

    [Fact]
    public async Task Registering_NeedsTheCheck_AWrongOrMissingTokenCreatesNothing()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();

        var none = await Client(tenant).PostAsJsonAsync($"{Base}/register", new { email, password = Good, phone = "+880 01712345678", firstName = "Sam" });
        var bot = await Client(tenant).PostAsJsonAsync($"{Base}/register", new { email, password = Good, phone = "+880 01712345678", firstName = "Sam", captchaToken = "bot" });
        var person = await Client(tenant).PostAsJsonAsync($"{Base}/register", new { email, password = Good, phone = "+880 01712345678", firstName = "Sam", captchaToken = "human" });

        Assert.Equal((HttpStatusCode.BadRequest, HttpStatusCode.BadRequest, HttpStatusCode.OK), (none.StatusCode, bot.StatusCode, person.StatusCode));
        Assert.Equal("captcha_failed", await ErrorOf(none));
        Assert.Equal(1, await DbCount(tenant));
    }

    private async Task<int> DbCount(string tenant)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        return await scope.ServiceProvider.GetRequiredService<Ota.CoreEngine.Data.OtaDbContext>().Customers.CountAsync();
    }

    // ------------------------------------------------------------------------------------------ signing in

    [Fact]
    public async Task ANormalSignIn_NeverMeetsTheCheck()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Client(tenant).PostAsJsonAsync($"{Base}/register", new { email, password = Good, phone = "+880 01712345678", firstName = "Sam", captchaToken = "human" });

        var ok = await Client(tenant).PostAsJsonAsync($"{Base}/login", new { email, password = Good });

        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);   // no token sent, none asked for
    }

    [Fact]
    public async Task AFewMistypes_AreForgiven_ThenTheNextAttemptNeedsTheCheck_EvenWithTheRightPassword()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Client(tenant).PostAsJsonAsync($"{Base}/register", new { email, password = Good, phone = "+880 01712345678", firstName = "Sam", captchaToken = "human" });

        for (var i = 0; i < AbuseLimits3(); i++)
            Assert.Equal("invalid_credentials", await ErrorOf(await Client(tenant).PostAsJsonAsync($"{Base}/login", new { email, password = "wrong " + i })));

        var asked = await Client(tenant).PostAsJsonAsync($"{Base}/login", new { email, password = Good });
        var bot = await Client(tenant).PostAsJsonAsync($"{Base}/login", new { email, password = Good, captchaToken = "bot" });
        var person = await Client(tenant).PostAsJsonAsync($"{Base}/login", new { email, password = Good, captchaToken = "human" });

        Assert.Equal((HttpStatusCode.Unauthorized, "captcha_required"), (asked.StatusCode, await ErrorOf(asked)));   // and the right password was NOT tried
        Assert.Equal("captcha_failed", await ErrorOf(bot));
        Assert.Equal(HttpStatusCode.OK, person.StatusCode);
    }

    private static int AbuseLimits3() => Ota.CoreEngine.RateLimiting.AbuseLimits.CaptchaAfterFailures;

    [Fact]
    public async Task TheCheckIsAskedForAnUnknownAddressToo_SoItRevealsNothingAboutWhoHasAnAccount()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var nobody = NewEmail();

        for (var i = 0; i < AbuseLimits3(); i++) await Client(tenant).PostAsJsonAsync($"{Base}/login", new { email = nobody, password = "wrong " + i });
        var asked = await Client(tenant).PostAsJsonAsync($"{Base}/login", new { email = nobody, password = Good });

        Assert.Equal("captcha_required", await ErrorOf(asked));
    }

    // ------------------------------------------------------------------------------------------ forgot password

    [Fact]
    public async Task ForgotPassword_NeedsTheCheck_AndSendsNothingWithoutIt()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var email = NewEmail();
        await Client(tenant).PostAsJsonAsync($"{Base}/register", new { email, password = Good, phone = "+880 01712345678", firstName = "Sam", captchaToken = "human" });
        var before = _mail.Sent.Count;

        var without = await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email });
        var withIt = await Client(tenant).PostAsJsonAsync($"{Base}/forgot-password", new { email, captchaToken = "human" });

        Assert.Equal((HttpStatusCode.BadRequest, HttpStatusCode.Accepted), (without.StatusCode, withIt.StatusCode));
        Assert.Equal(before + 1, _mail.Sent.Count);
    }

    // ------------------------------------------------------------------------------------------ the real verifier

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public HttpRequestMessage? Seen;
        public string? Body;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Seen = request; Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
            return respond(request);
        }
    }

    private sealed class Factory1(HttpMessageHandler h) : IHttpClientFactory { public HttpClient CreateClient(string name) => new(h, disposeHandler: false); }

    private static TurnstileVerifier Verifier(Handler h, string? secret = "test-secret") =>
        new(new Factory1(h), new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["TURNSTILE_SECRET"] = secret }).Build(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<TurnstileVerifier>.Instance);

    [Fact]
    public async Task TheRealVerifier_SendsTheSecretAndTheToken_AndBelievesOnlyASuccessAnswer()
    {
        var ok = new Handler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { success = true }) });
        var no = new Handler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { success = false }) });

        Assert.True(await Verifier(ok).VerifyAsync("tok", "203.0.113.5", default));
        Assert.Equal(TurnstileVerifier.Endpoint, ok.Seen!.RequestUri!.ToString());
        Assert.Contains("secret=test-secret", ok.Body);
        Assert.Contains("response=tok", ok.Body);
        Assert.Contains("remoteip=203.0.113.5", ok.Body);
        Assert.False(await Verifier(no).VerifyAsync("tok", null, default));
    }

    [Fact]
    public async Task TheRealVerifier_FailsClosed_WhenCloudflareIsUnreachable_OrTheTokenIsMissing()
    {
        var down = new Handler(_ => throw new HttpRequestException("network down"));
        var never = new Handler(_ => throw new InvalidOperationException("must not be called"));

        Assert.False(await Verifier(down).VerifyAsync("tok", null, default));
        Assert.False(await Verifier(never).VerifyAsync(null, null, default));      // no token: refused without even asking
        Assert.False(await Verifier(never).VerifyAsync(new string('x', 5000), null, default));
    }

    [Fact]
    public async Task WithoutASecret_TheCheckIsOff_AsInLocalDevelopment()
    {
        var verifier = Verifier(new Handler(_ => throw new InvalidOperationException("must not be called")), secret: null);

        Assert.False(verifier.IsEnabled);
        Assert.True(await verifier.VerifyAsync(null, null, default));
    }
}
