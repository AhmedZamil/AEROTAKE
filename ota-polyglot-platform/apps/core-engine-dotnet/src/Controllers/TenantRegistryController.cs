using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;

namespace Ota.CoreEngine.Controllers;

public sealed record TenantBrandingResponse(string Name, string LogoUrl, string PrimaryColor, string AccentColor);

public sealed record TenantRegistryResponse(
    string TenantId,
    string Channel,
    Guid? AgentId,
    string SellCurrency,
    string MarkupProfile,
    TenantBrandingResponse Branding);

/// <summary>
/// Host -> tenant lookup for the frontends' edge middleware, which has to know the
/// tenant BEFORE anyone is logged in — so this is anonymous and exempt from
/// TenantResolutionMiddleware, like /healthz. Read-only; tenants are created and
/// changed only by scripts/provision-tenant.sh.
///
/// Interim protection until service tokens exist (P0-12): when TENANT_REGISTRY_KEY is
/// configured, callers must send it as X-Registry-Key. Unset (local dev) leaves the
/// endpoint open. A host that is unknown, or whose tenant or domain is inactive, gets the
/// same 404 so the response never reveals which hosts exist but are switched off.
/// </summary>
[ApiController]
[Route("api/v1/tenant-registry")]
[AllowAnonymous]
public sealed class TenantRegistryController(OtaDbContext db, IConfiguration config) : ControllerBase
{
    public const string KeyHeader = "X-Registry-Key";

    [HttpGet("resolve")]
    public async Task<IActionResult> Resolve([FromQuery] string? host, CancellationToken ct)
    {
        if (!KeyIsValid()) return Unauthorized(new { error = "invalid_registry_key" });

        var bare = NormalizeHost(host);
        if (bare is null) return BadRequest(new { error = "invalid_host", message = "Query parameter 'host' is required." });

        var domain = await db.TenantDomains.AsNoTracking()
            .Include(d => d.Tenant)
            .FirstOrDefaultAsync(d => d.Host == bare, ct);

        if (domain is null || !domain.IsActive || !domain.Tenant.IsActive)
            return NotFound(new { error = "unknown_host" });

        // Short client-side cache; the frontends also keep their own TTL cache.
        Response.Headers.CacheControl = "private, max-age=30";
        return Ok(new TenantRegistryResponse(
            domain.TenantId,
            domain.Channel,
            domain.AgentId,
            domain.Tenant.SellCurrency,
            domain.MarkupProfile,
            new TenantBrandingResponse(domain.BrandName, domain.LogoUrl, domain.PrimaryColor, domain.AccentColor)));
    }

    /// <summary>Lowercase, port removed — the form hosts are stored in.</summary>
    internal static string? NormalizeHost(string? host)
    {
        if (string.IsNullOrWhiteSpace(host)) return null;
        var h = host.Trim().ToLowerInvariant();
        var colon = h.LastIndexOf(':');
        // IPv6 literals are not served; a single colon means host:port.
        if (colon > 0 && h.IndexOf(':') == colon) h = h[..colon];
        return h.Length is > 0 and <= 253 ? h : null;
    }

    private bool KeyIsValid()
    {
        var expected = config["TENANT_REGISTRY_KEY"];
        if (string.IsNullOrEmpty(expected)) return true;

        var supplied = Request.Headers[KeyHeader].ToString();
        return CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(supplied)),
            SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
    }
}
