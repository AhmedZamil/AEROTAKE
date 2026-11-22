using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>B-3: abuse limits on the agent auth endpoints (login, verify-device, forgot/reset, register), with limiting switched ON.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class AgentAuthRateLimitingTests(OtaCoreEngineFixture fixture)
{
    private const string Password = "test-password";
    private const string Auth = "/api/v1/auth";

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

    private WebApplicationFactory<Program> Build() => fixture.Factory.WithWebHostBuilder(b =>
    {
        b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["RateLimiting:Enabled"] = "true" }));
        b.ConfigureServices(s => s.AddTransient<IStartupFilter, PeerFilter>());
    });

    private static int _counter = (int)(Environment.TickCount64 % 200);
    private static string NewIp() => $"101.{Random.Shared.Next(1, 254)}.{Random.Shared.Next(1, 254)}.{Interlocked.Increment(ref _counter) % 250 + 1}";

    private static HttpClient As(WebApplicationFactory<Program> f, string tenant, string ip)
    {
        var c = f.CreateClient();
        c.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        c.DefaultRequestHeaders.Add("X-Forwarded-For", ip);
        return c;
    }

    private async Task<(string Tenant, string Email, Guid UserId)> SeedAgentAsync()
    {
        var (tenant, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var agent = await TestData.ReloadAgentAsync(fixture.Factory, agentId);
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var user = await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Users.SingleAsync(u => u.AgentId == agentId);
        return (tenant, agent.Email, user.Id);
    }

    private static Task<HttpResponseMessage> Login(HttpClient c, string email, string password = "wrong-password") =>
        c.PostAsJsonAsync($"{Auth}/login", new { email, password, deviceToken = (string?)null });

    [Fact]
    public async Task WrongPasswordsForOneAccount_FromAnywhere_LockThatAccount_EvenForTheRightPassword()
    {
        var f = Build();
        var (tenant, email, _) = await SeedAgentAsync();

        for (var i = 0; i < 8; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(As(f, tenant, NewIp()), email)).StatusCode);

        var locked = await Login(As(f, tenant, NewIp()), email, Password);
        Assert.Equal(HttpStatusCode.TooManyRequests, locked.StatusCode);
        Assert.Equal("rate_limited", (await locked.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());

        // A different account on another tenant is unaffected
        var other = await SeedAgentAsync();
        Assert.Equal(HttpStatusCode.OK, (await Login(As(f, other.Tenant, NewIp()), other.Email, Password)).StatusCode);
    }

    [Fact]
    public async Task WrongPasswordsFromOneAddress_LockThatAddress_EvenForAGenuineLogin()
    {
        var f = Build();
        var (tenant, email, _) = await SeedAgentAsync();
        var ip = NewIp();

        for (var i = 0; i < 10; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(As(f, tenant, ip), $"{Guid.NewGuid():N}@test.example")).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login(As(f, tenant, ip), email, Password)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(As(f, tenant, NewIp()), email, Password)).StatusCode);
    }

    [Fact]
    public async Task SuccessfulLogins_DoNotCountAsFailures()
    {
        var f = Build();
        var (tenant, email, _) = await SeedAgentAsync();
        var ip = NewIp();

        for (var i = 0; i < 12; i++) // more than the failure limit of 10
            Assert.Equal(HttpStatusCode.OK, (await Login(As(f, tenant, ip), email, Password)).StatusCode);
    }

    [Fact]
    public async Task WrongDeviceCodes_ForOneUser_AreLimited_WithoutAffectingAnother()
    {
        var f = Build();
        var (tenant, _, userId) = await SeedAgentAsync();
        var other = await SeedAgentAsync();

        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.BadRequest, (await As(f, tenant, NewIp()).PostAsJsonAsync($"{Auth}/verify-device", new { userId, code = $"00000{i}" })).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await As(f, tenant, NewIp()).PostAsJsonAsync($"{Auth}/verify-device", new { userId, code = "999999" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await As(f, other.Tenant, NewIp()).PostAsJsonAsync($"{Auth}/verify-device", new { userId = other.UserId, code = "000000" })).StatusCode);
    }

    [Fact]
    public async Task Register_IsLimitedPerAddress()
    {
        var f = Build();
        var tenant = $"test-tenant-{Guid.NewGuid():N}";
        var ip = NewIp();

        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 7; i++)
        {
            codes.Add((await As(f, tenant, ip).PostAsJsonAsync($"{Auth}/register", new
            {
                agencyName = $"Agency {i}",
                email = $"{Guid.NewGuid():N}@test.example",
                password = "Passw0rd!!",
                firstName = "A",
                lastName = "B",
            })).StatusCode);
        }

        Assert.Equal(5, codes.Count(c => c == HttpStatusCode.Created));
        Assert.Equal(2, codes.Count(c => c == HttpStatusCode.TooManyRequests));
    }

    [Fact]
    public async Task ForgotPassword_CannotFloodOneInbox_AndTheLimitIsSilent()
    {
        var f = Build();
        var (tenant, email, userId) = await SeedAgentAsync();

        int before;
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
            before = await scope.ServiceProvider.GetRequiredService<OtaDbContext>().VerificationCodes
                .CountAsync(c => c.UserId == userId && c.Purpose == VerificationPurpose.PasswordReset);

        for (var i = 0; i < 6; i++)
        {
            var r = await As(f, tenant, NewIp()).PostAsJsonAsync($"{Auth}/forgot-password", new { email });
            Assert.Equal(HttpStatusCode.OK, r.StatusCode); // never a 429: the per-email limit is silent
        }

        using var afterScope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var after = await afterScope.ServiceProvider.GetRequiredService<OtaDbContext>().VerificationCodes
            .CountAsync(c => c.UserId == userId && c.Purpose == VerificationPurpose.PasswordReset);
        Assert.Equal(3, after - before); // three codes issued, not six
    }
}
