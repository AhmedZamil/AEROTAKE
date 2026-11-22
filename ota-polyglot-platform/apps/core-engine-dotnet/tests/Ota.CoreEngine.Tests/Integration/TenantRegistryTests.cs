using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P0-5: the host -> tenant registry the frontend edge resolves against. The
/// registry is global (no tenant query filter) and anonymous, so these also pin down
/// what it must NOT do: reveal switched-off hosts, or accept bad channel/host data.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class TenantRegistryTests(OtaCoreEngineFixture fixture)
{
    private async Task<string> SeedAsync(bool tenantActive = true, bool domainActive = true, string channel = "WHITE_LABEL", Guid? agentId = null)
    {
        var id = Guid.NewGuid().ToString("N")[..12];
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var tenant = new Tenant { TenantId = $"reg-{id}", DisplayName = "Registry Test", SellCurrency = "BDT", IsActive = tenantActive };
        tenant.Domains.Add(new TenantDomain
        {
            Host = $"{id}.example.test", Channel = channel, AgentId = agentId, IsActive = domainActive,
            BrandName = "Brand " + id, LogoUrl = "/logo.svg", PrimaryColor = "#111111", AccentColor = "#222222", MarkupProfile = "gold-tier",
        });
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync();
        return $"{id}.example.test";
    }

    private static string Url(string host) => $"/api/v1/tenant-registry/resolve?host={Uri.EscapeDataString(host)}";

    [Fact]
    public async Task KnownHost_ResolvesWithoutAnyTenantHeaderOrLogin_IgnoringCaseAndPort()
    {
        var agentId = Guid.NewGuid();
        var host = await SeedAsync(agentId: agentId);
        var client = fixture.Factory.CreateClient(); // anonymous, no X-Tenant-ID

        var response = await client.GetAsync(Url(host.ToUpperInvariant() + ":3000"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.StartsWith("reg-", body.GetProperty("tenantId").GetString());
        Assert.Equal("WHITE_LABEL", body.GetProperty("channel").GetString());
        Assert.Equal(agentId, body.GetProperty("agentId").GetGuid());
        Assert.Equal("BDT", body.GetProperty("sellCurrency").GetString());
        Assert.Equal("gold-tier", body.GetProperty("markupProfile").GetString());
        Assert.Equal("#111111", body.GetProperty("branding").GetProperty("primaryColor").GetString());
    }

    [Fact]
    public async Task UnknownHost_Is404()
    {
        var response = await fixture.Factory.CreateClient().GetAsync(Url($"nobody-{Guid.NewGuid():N}.example.test"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public async Task InactiveTenantOrDomain_LooksExactlyLikeAnUnknownHost(bool tenantActive, bool domainActive)
    {
        var host = await SeedAsync(tenantActive, domainActive);
        var unknown = await fixture.Factory.CreateClient().GetAsync(Url($"nobody-{Guid.NewGuid():N}.example.test"));

        var response = await fixture.Factory.CreateClient().GetAsync(Url(host));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(await unknown.Content.ReadAsStringAsync(), await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task MissingHost_Is400()
    {
        var response = await fixture.Factory.CreateClient().GetAsync("/api/v1/tenant-registry/resolve");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task WhenRegistryKeyIsConfigured_ItIsRequired()
    {
        var host = await SeedAsync();
        var factory = fixture.Factory.WithWebHostBuilder(b =>
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["TENANT_REGISTRY_KEY"] = "s3cret-key" })));

        var missing = await factory.CreateClient().GetAsync(Url(host));
        var wrongClient = factory.CreateClient();
        wrongClient.DefaultRequestHeaders.Add("X-Registry-Key", "wrong");
        var wrong = await wrongClient.GetAsync(Url(host));
        var rightClient = factory.CreateClient();
        rightClient.DefaultRequestHeaders.Add("X-Registry-Key", "s3cret-key");
        var right = await rightClient.GetAsync(Url(host));

        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.OK, right.StatusCode);
    }

    [Fact]
    public async Task Database_RejectsAnUnknownChannelAndAnUppercaseHost()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var id = Guid.NewGuid().ToString("N")[..12];
        db.Tenants.Add(new Tenant { TenantId = $"reg-{id}", DisplayName = "x", SellCurrency = "USD" });
        await db.SaveChangesAsync();

        TenantDomain Domain(string host, string channel) => new()
        {
            Host = host, TenantId = $"reg-{id}", Channel = channel, BrandName = "b", LogoUrl = "/l", PrimaryColor = "#1", AccentColor = "#2", MarkupProfile = "m",
        };

        db.TenantDomains.Add(Domain($"{id}.example.test", "SOMETHING_ELSE"));
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();

        db.TenantDomains.Add(Domain($"{id.ToUpperInvariant()}.EXAMPLE.TEST", "B2C"));
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
