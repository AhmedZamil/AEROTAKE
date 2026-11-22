using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.RateLimiting;

namespace Ota.CoreEngine.Controllers;

public sealed record ServiceTokenRequest(string? ClientId, string? ClientSecret);

public sealed record ServiceTokenResponse(string AccessToken, DateTimeOffset ExpiresAt);

/// <summary>Exchanges a frontend's client credentials for a short-lived service token (OAuth2
/// "client credentials"). The token can only do what the client's configured scopes, channels and tenants
/// allow (see ServiceClient), so a leaked client secret is bounded to scoped read access — it can neither
/// book nor mint other tokens — and is revoked by editing SERVICE_CLIENTS.
/// Anonymous and exempt from tenant resolution, like the other bootstrap endpoints.</summary>
[ApiController]
[Route("api/v1/auth/service")]
[AllowAnonymous]
public sealed class ServiceAuthController(IServiceClientRegistry clients, IJwtTokenService tokens, IAbuseGuard guard, ILogger<ServiceAuthController> logger) : ControllerBase
{
    [HttpPost("token")]
    public async Task<IActionResult> Token(ServiceTokenRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.ServiceTokenPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;

        var client = clients.Authenticate(request.ClientId, request.ClientSecret);
        if (client is null)
        {
            // Same answer whether the client is unknown, the secret is wrong, or none are configured.
            logger.LogWarning("Service token refused for client '{ClientId}'{NotConfigured}.",
                request.ClientId, clients.Any ? "" : " (no SERVICE_CLIENTS configured)");
            return Unauthorized(new { error = "invalid_client" });
        }

        var issued = tokens.IssueServiceToken(client);
        Response.Headers.CacheControl = "no-store";
        return Ok(new ServiceTokenResponse(issued.AccessToken, issued.AccessTokenExpiresAt));
    }
}
