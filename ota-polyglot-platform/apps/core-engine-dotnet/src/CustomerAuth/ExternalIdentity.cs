namespace Ota.CoreEngine.CustomerAuth;

/// <summary>A person as vouched for by an identity provider — only what was verified, never what the client claims.</summary>
/// <param name="Provider">google | facebook (see Domain.IdentityProviders).</param>
/// <param name="Subject">The provider's stable id for the account (Google "sub"). Never the email: emails change and are reused.</param>
/// <param name="Email">As reported by the provider; may be absent.</param>
/// <param name="EmailVerified">True only if the provider itself says it verified this email.</param>
public sealed record ExternalIdentity(
    string Provider,
    string Subject,
    string? Email,
    bool EmailVerified,
    string? GivenName,
    string? FamilyName);

/// <summary>Turns a token from an identity provider into a verified <see cref="ExternalIdentity"/>.</summary>
public interface IExternalIdentityVerifier
{
    string Provider { get; }

    /// <summary>False until the provider is configured (e.g. a Google client id); callers answer "provider not
    /// configured" instead of pretending the token was bad.</summary>
    bool IsConfigured { get; }

    /// <summary>Null when the token is not valid for this platform — bad signature, wrong audience or issuer, expired,
    /// unknown key, or (when <paramref name="expectedNonce"/> is given) a different nonce. Never throws for a bad token.</summary>
    Task<ExternalIdentity?> VerifyAsync(string idToken, string? expectedNonce, CancellationToken ct);
}
