using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Data;

/// <summary>Development-only: registers the hosts the local stack is reached on, replacing
/// the hardcoded map that used to live in the frontend's lib/tenants.ts. Real tenants are
/// created with scripts/provision-tenant.sh. Skipped as soon as any tenant exists, so it
/// never overwrites what an operator provisioned.</summary>
public static class TenantRegistrySeeder
{
    public static async Task SeedAsync(OtaDbContext db, ILogger logger, CancellationToken ct = default)
    {
        await SeedB2CStorefrontAsync(db, logger, ct);
        if (await db.Tenants.AnyAsync(t => t.TenantId == "demo-tenant", ct)) return;

        // The white-label agency is whichever agent DbSeeder created, so nobody has to
        // copy a GUID by hand (the old registry needed exactly that).
        var skybridgeAgentId = await db.Agents.IgnoreQueryFilters()
            .Where(a => a.TenantId == "demo-tenant" && a.Email == "ops@skybridge.example")
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(ct);

        var tenant = new Tenant { TenantId = "demo-tenant", DisplayName = "AeroTake Demo", SellCurrency = "USD" };
        TenantDomain Domain(string host, string channel, string brand, string logo, string primary, string accent, string markup, Guid? agentId = null) => new()
        {
            Host = host, TenantId = tenant.TenantId, Channel = channel, AgentId = agentId,
            BrandName = brand, LogoUrl = logo, PrimaryColor = primary, AccentColor = accent, MarkupProfile = markup,
        };

        foreach (var host in new[] { "localhost", "127.0.0.1" })
            tenant.Domains.Add(Domain(host, "B2C", "AeroTake", "/images/verticle_logo_1.png", "#0B3D5C", "#F2A104", "b2c-default"));
        tenant.Domains.Add(Domain("skybridge.example.com", "WHITE_LABEL", "SkyBridge Travels", "/branding/skybridge.svg",
            "#1F2A44", "#3EC6A8", "gold-tier", skybridgeAgentId));

        db.Tenants.Add(tenant);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded dev tenant registry: {Hosts}", string.Join(", ", tenant.Domains.Select(d => d.Host)));
    }

    /// <summary>The consumer storefront's own tenant (a B2C site is its own tenant, never a slice of an agency's), reached locally at
    /// http://b2c.localhost:3001 — *.localhost resolves to the loopback address in browsers, so no hosts-file edit is needed. It is the tenant
    /// the frontend-b2c service credential is allowed to act for (scripts/generate-service-clients.sh --b2c-tenant, default aerotake-b2c).
    /// Development only, and only when it does not exist yet: it never overwrites what an operator provisioned.</summary>
    private static async Task SeedB2CStorefrontAsync(OtaDbContext db, ILogger logger, CancellationToken ct)
    {
        const string tenantId = "aerotake-b2c";
        if (await db.Tenants.AnyAsync(t => t.TenantId == tenantId, ct)) return;

        var tenant = new Tenant { TenantId = tenantId, DisplayName = "AeroTake (consumer site)", SellCurrency = "BDT" };
        tenant.Domains.Add(new TenantDomain
        {
            Host = "b2c.localhost", TenantId = tenantId, Channel = "B2C", BrandName = "AeroTake",
            LogoUrl = "/images/verticle_logo_1.png", PrimaryColor = "#0B3D5C", AccentColor = "#F2A104", MarkupProfile = "b2c-default",
        });
        db.Tenants.Add(tenant);
        // Consumer pricing for this tenant: an 8% markup on the supplier fare. A tenant with no B2C rule cannot sell (search says so).
        db.MarkupRules.Add(new MarkupRule { TenantId = tenantId, Channel = MarkupChannels.B2C, Tier = null, MarkupPercent = 0.08m, SubAgentDefaultMargin = 0m });
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded dev B2C storefront tenant {TenantId} at host b2c.localhost", tenantId);
    }
}
