using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.CustomerAuth;

public sealed record CustomerTokens(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAt);

/// <summary>What a valid customer refresh token says, for the refresh and logout flows.</summary>
public sealed record CustomerRefreshClaims(Guid CustomerId, string TenantId, string TokenId, string SessionId, long IssuedAtMs, DateTimeOffset ExpiresAt);

/// <summary>Issues and reads customer tokens: audience ota-customers, signed with the customers key, actor_type customer, channel
/// B2C. Kept apart from the agent token service so the two kinds of token cannot be mixed up in code any more than in
/// cryptography.</summary>
public interface ICustomerTokenService
{
    /// <summary>A new pair. Every token in one sign-in chain shares a session id: pass the existing one when REFRESHING so the chain stays
    /// one session (which sign-out can then end as a whole), or nothing for a fresh sign-in.</summary>
    CustomerTokens Issue(Customer customer, string? sessionId = null);

    /// <summary>Null for anything that is not a genuine, unexpired customer REFRESH token (wrong audience, key, type, expiry).</summary>
    CustomerRefreshClaims? ReadRefreshToken(string refreshToken);
}

public sealed class CustomerTokenService(IConfiguration config, IJwtKeyRing keys) : ICustomerTokenService
{
    public static readonly TimeSpan AccessLifetime = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan RefreshLifetime = TimeSpan.FromDays(30);
    private const string Channel = "B2C";

    private string Issuer => config["Jwt:Issuer"] ?? "ota-core-engine";

    public CustomerTokens Issue(Customer customer, string? sessionId = null)
    {
        var now = DateTimeOffset.UtcNow;
        var sid = sessionId ?? Guid.NewGuid().ToString("N");
        var accessExpires = now.Add(AccessLifetime);
        return new CustomerTokens(Build(customer, "access", sid, now, accessExpires), Build(customer, "refresh", sid, now, now.Add(RefreshLifetime)), accessExpires);
    }

    private string Build(Customer customer, string tokenType, string sessionId, DateTimeOffset issuedAt, DateTimeOffset expires)
    {
        var claims = new[]
        {
            new Claim("sid", sessionId),
            // Milliseconds, because the standard iat is whole seconds: a customer who signs out everywhere and signs straight back in must
            // not have the new token rejected as "older than the cut-off" just because they landed in the same second.
            new Claim("iat_ms", issuedAt.ToUnixTimeMilliseconds().ToString(), ClaimValueTypes.Integer64),
            new Claim(JwtRegisteredClaimNames.Sub, customer.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("tenant_id", customer.TenantId),
            new Claim("channel", Channel),
            new Claim(ActorTypes.ClaimName, ActorTypes.Customer),
            new Claim("token_type", tokenType),
        };
        var token = new JwtSecurityToken(Issuer, TokenAudiences.Customers, claims, expires: expires.UtcDateTime,
            signingCredentials: keys.SigningCredentialsFor(TokenAudiences.Customers));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public CustomerRefreshClaims? ReadRefreshToken(string refreshToken)
    {
        try
        {
            var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
            var principal = handler.ValidateToken(refreshToken, new TokenValidationParameters
            {
                ValidIssuer = Issuer,
                ValidAudience = TokenAudiences.Customers,
                IssuerSigningKeyResolver = (_, token, kid, _) => JwtKeyRing.Resolve(keys, token, kid),
                ValidAlgorithms = [JwtKeyRing.Algorithm],
                RequireSignedTokens = true,
                ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true, ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromSeconds(30),
            }, out var validated);

            if (principal.FindFirstValue("token_type") != "refresh") return null;
            if (principal.FindFirstValue(ActorTypes.ClaimName) != ActorTypes.Customer) return null;
            var tenant = principal.FindFirstValue("tenant_id");
            var jti = principal.FindFirstValue(JwtRegisteredClaimNames.Jti);
            var sid = principal.FindFirstValue("sid");
            if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var customerId) || string.IsNullOrEmpty(tenant) || string.IsNullOrEmpty(jti)
                || string.IsNullOrEmpty(sid) || !long.TryParse(principal.FindFirstValue("iat_ms"), out var issuedAtMs)) return null;

            return new CustomerRefreshClaims(customerId, tenant, jti, sid, issuedAtMs, new DateTimeOffset(validated.ValidTo, TimeSpan.Zero));
        }
        catch (SecurityTokenException) { return null; }
        catch (ArgumentException) { return null; } // not even a well-formed JWT
    }
}
