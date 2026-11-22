using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;

namespace Ota.CoreEngine.Tenancy;

/// <summary>Which tenants are live consumer (B2C) storefronts. The consumer endpoints are anonymous and take the tenant from
/// X-Tenant-ID, so they must check that it names a real, active B2C storefront — otherwise anyone could create accounts or probe
/// bookings inside any tenant id they invented.</summary>
public interface IStorefrontTenants
{
    Task<bool> IsB2CAsync(string? tenantId, CancellationToken ct);

    /// <summary>The host customers of this tenant reach the storefront on — where emailed links point. Null if none.</summary>
    Task<string?> PrimaryB2CHostAsync(string tenantId, CancellationToken ct);

    /// <summary>The address emailed links point at ("https://shop.example"): STOREFRONT_PUBLIC_URL when set (development, where the site
    /// runs on a port and a host the registry cannot express), otherwise https://{primary host} (http for localhost). Taken from OUR
    /// registry, never from the request — a link built from a request header could be pointed at an attacker's site. Null if none.</summary>
    Task<string?> PublicBaseUrlAsync(string tenantId, CancellationToken ct);
}

public sealed class StorefrontTenants(OtaDbContext db, IConfiguration config) : IStorefrontTenants
{
    public async Task<string?> PublicBaseUrlAsync(string tenantId, CancellationToken ct)
    {
        if (config["STOREFRONT_PUBLIC_URL"] is { Length: > 0 } fixedUrl) return fixedUrl.TrimEnd('/');
        var host = await PrimaryB2CHostAsync(tenantId, ct);
        if (host is null) return null;
        var scheme = host.StartsWith("localhost", StringComparison.OrdinalIgnoreCase) || host.StartsWith("127.0.0.1") ? "http" : "https";
        return $"{scheme}://{host}";
    }

    public Task<bool> IsB2CAsync(string? tenantId, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(tenantId)
            ? Task.FromResult(false)
            : db.TenantDomains.AsNoTracking().AnyAsync(d => d.TenantId == tenantId && d.IsActive && d.Channel == "B2C" && d.Tenant.IsActive, ct);

    public Task<string?> PrimaryB2CHostAsync(string tenantId, CancellationToken ct) =>
        db.TenantDomains.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.IsActive && d.Channel == "B2C" && d.Tenant.IsActive)
            .OrderBy(d => d.CreatedAt).ThenBy(d => d.Host)
            .Select(d => (string?)d.Host)
            .FirstOrDefaultAsync(ct);
}
