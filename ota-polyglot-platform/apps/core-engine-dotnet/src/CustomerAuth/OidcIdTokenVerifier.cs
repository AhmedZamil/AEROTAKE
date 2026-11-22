using System.Text.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Ota.CoreEngine.CustomerAuth;

/// <summary>Verifies an OpenID Connect ID token: the signature against the provider's published keys, that it was issued by
/// the provider, that it was issued for THIS platform (audience = our client id, so a token a user gave to some other app can't
/// be replayed here), that it has not expired, and — when the caller supplies one — that it carries the expected nonce.
/// Only RS256 is accepted; the algorithm is never taken from the token.</summary>
public class OidcIdTokenVerifier(
    string provider,
    IReadOnlyCollection<string> issuers,
    IReadOnlyCollection<string> audiences,
    Func<CancellationToken, Task<IReadOnlyCollection<SecurityKey>>> signingKeys,
    Func<Task>? onUnknownKey = null) : IExternalIdentityVerifier
{
    public string Provider => provider;
    public bool IsConfigured => audiences.Count > 0;

    private static readonly JsonWebTokenHandler Handler = new() { MapInboundClaims = false };

    public async Task<ExternalIdentity?> VerifyAsync(string idToken, string? expectedNonce, CancellationToken ct)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(idToken)) return null;

        var result = await ValidateAsync(idToken, ct);

        // Providers rotate their keys: an unknown key id may just mean ours is stale. Refresh once and try again.
        if (!result.IsValid && result.Exception is SecurityTokenSignatureKeyNotFoundException or SecurityTokenInvalidSignatureException && onUnknownKey is not null)
        {
            await onUnknownKey();
            result = await ValidateAsync(idToken, ct);
        }
        if (!result.IsValid) return null;

        var claims = result.Claims;
        if (expectedNonce is not null && !(claims.TryGetValue("nonce", out var nonce) && nonce as string == expectedNonce)) return null;

        var subject = claims.TryGetValue("sub", out var sub) ? sub as string : null;
        if (string.IsNullOrWhiteSpace(subject)) return null;

        return new ExternalIdentity(
            provider, subject,
            Email: claims.TryGetValue("email", out var email) ? email as string : null,
            EmailVerified: claims.TryGetValue("email_verified", out var verified) && IsTrue(verified),
            GivenName: claims.TryGetValue("given_name", out var given) ? given as string : null,
            FamilyName: claims.TryGetValue("family_name", out var family) ? family as string : null);
    }

    private async Task<TokenValidationResult> ValidateAsync(string idToken, CancellationToken ct) =>
        await Handler.ValidateTokenAsync(idToken, new TokenValidationParameters
        {
            ValidIssuers = issuers,
            ValidAudiences = audiences,
            IssuerSigningKeys = await signingKeys(ct),
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            RequireSignedTokens = true,
            RequireExpirationTime = true,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(1),
        });

    /// <summary>Providers send email_verified as a JSON boolean, or occasionally as the string "true".</summary>
    private static bool IsTrue(object? value) => value switch
    {
        bool b => b,
        string s => s.Equals("true", StringComparison.OrdinalIgnoreCase),
        JsonElement { ValueKind: JsonValueKind.True } => true,
        JsonElement { ValueKind: JsonValueKind.String } e => e.GetString()?.Equals("true", StringComparison.OrdinalIgnoreCase) == true,
        _ => false,
    };
}
