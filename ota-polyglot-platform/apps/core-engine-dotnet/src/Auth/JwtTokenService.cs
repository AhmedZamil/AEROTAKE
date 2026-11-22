using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tenancy;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Auth;

public sealed record IssuedTokens(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAt);

public interface IJwtTokenService
{
    IssuedTokens IssueTokens(User user);

    /// <summary>Validates a refresh token and returns the user id it was issued for,
    /// or null if invalid/expired/not actually a refresh token.</summary>
    Guid? ValidateRefreshToken(string refreshToken);

    /// <summary>A short-lived token for a frontend acting on behalf of anonymous visitors. Carries the client's
    /// scopes, channels and tenants as claims; audience ota-internal, actor_type service.</summary>
    IssuedTokens IssueServiceToken(ServiceClient client);
}

/// <summary>
/// Stateless JWT issuance — no refresh-token revocation list (a documented
/// simplification). Claims carry tenant/agent/role so TenantResolutionMiddleware
/// can trust them over the raw X-Tenant-ID header on authenticated routes.
/// Signed with ES256 using the audience's active key (see JwtKeyRing); nothing outside
/// core-engine ever holds a key that can sign.
/// </summary>
public sealed class JwtTokenService(IConfiguration config, IJwtKeyRing keys) : IJwtTokenService
{
    private const string TokenTypeClaim = "token_type";
    private static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(30);

    public IssuedTokens IssueTokens(User user)
    {
        var now = DateTimeOffset.UtcNow;
        var accessExpires = now.Add(AccessTokenLifetime);

        var accessToken = BuildToken(user, "access", accessExpires);
        var refreshToken = BuildToken(user, "refresh", now.Add(RefreshTokenLifetime));

        return new IssuedTokens(accessToken, refreshToken, accessExpires);
    }

    public Guid? ValidateRefreshToken(string refreshToken)
    {
        // MapInboundClaims defaults to true, which silently rewrites short
        // claim names ("sub") to long XML-namespace URIs on the resulting
        // ClaimsPrincipal — so FindFirstValue(JwtRegisteredClaimNames.Sub)
        // ("sub") would find nothing even for a perfectly valid token,
        // making every refresh fail with invalid_refresh_token. Disabling it
        // keeps the claim names exactly as BuildToken issued them.
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        try
        {
            var principal = handler.ValidateToken(refreshToken, ValidationParameters(), out _);
            var tokenType = principal.FindFirstValue(TokenTypeClaim);
            if (tokenType != "refresh") return null;

            var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            return Guid.TryParse(sub, out var userId) ? userId : null;
        }
        catch (SecurityTokenException)
        {
            return null;
        }
    }

    private string BuildToken(User user, string tokenType, DateTimeOffset expires)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("tenant_id", user.TenantId),
            new("role", user.Role.ToString()),
            // Read by TenantResolutionMiddleware instead of any client header.
            // Agent staff are B2B_AGENT; platform admins (no agent) are PLATFORM.
            // Sub-agent detection needs the Agent row and is not done here.
            new(TenantResolutionMiddleware.ChannelClaim, user.AgentId is null ? "PLATFORM" : "B2B_AGENT"),
            // Everyone in the Users table is agency staff or a platform admin; customers
            // and services get their own issuers/audiences (see TokenAudiences).
            new(ActorTypes.ClaimName, ActorTypes.Agent),
            new(TokenTypeClaim, tokenType),
        };
        if (user.AgentId is { } agentId) claims.Add(new Claim("agent_id", agentId.ToString()));

        var credentials = keys.SigningCredentialsFor(TokenAudiences.Agents);
        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: TokenAudiences.Agents,
            claims: claims,
            expires: expires.UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Kept short: it is re-obtained with the client secret, so revoking a client takes effect quickly.</summary>
    public static readonly TimeSpan ServiceTokenLifetime = TimeSpan.FromMinutes(10);

    public IssuedTokens IssueServiceToken(ServiceClient client)
    {
        var expires = DateTimeOffset.UtcNow.Add(ServiceTokenLifetime);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, client.Id),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(ActorTypes.ClaimName, ActorTypes.Service),
            new(TokenTypeClaim, "service"),
            new("scope", string.Join(' ', client.Scopes.Order())),
            new("channels", string.Join(' ', client.Channels.Order())),
            new("tenants", string.Join(' ', client.Tenants.Order())),
        };
        var token = new JwtSecurityToken(
            issuer: Issuer, audience: TokenAudiences.Internal, claims: claims,
            expires: expires.UtcDateTime, signingCredentials: keys.SigningCredentialsFor(TokenAudiences.Internal));
        var jwt = new JwtSecurityTokenHandler().WriteToken(token);
        return new IssuedTokens(jwt, jwt, expires); // no refresh concept: the client re-authenticates
    }

    private string Issuer => config["Jwt:Issuer"] ?? "ota-core-engine";


    public TokenValidationParameters ValidationParameters() => new()
    {
        ValidIssuer = Issuer,
        ValidAudience = TokenAudiences.Agents,
        IssuerSigningKeyResolver = (_, token, kid, _) => JwtKeyRing.Resolve(keys, token, kid),
        ValidAlgorithms = [JwtKeyRing.Algorithm],
        RequireSignedTokens = true,
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ClockSkew = TimeSpan.FromSeconds(30),
    };
}
