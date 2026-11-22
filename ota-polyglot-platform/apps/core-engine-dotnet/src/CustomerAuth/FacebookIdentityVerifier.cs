using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Ota.CoreEngine.CustomerAuth;

/// <summary>Facebook sign-in through Facebook's OpenID Connect ID token (Limited Login / Facebook Login with the openid scope).
/// Same checks as Google — signature against Facebook's published keys, issuer, audience = our Facebook app id(s)
/// (FACEBOOK_APP_IDS, comma separated), expiry, nonce — with one deliberate difference: an email from Facebook is NEVER treated as
/// verified. Facebook's ID token carries no email_verified claim, and an address a person typed into a Facebook profile is not proof
/// they own it, so such an email cannot link this login to an existing customer or become the customer's own address
/// (CustomerSignInService only trusts a provider-verified email). The customer starts without an email and confirms one later.
/// Until an app id is configured the provider is off and sign-in answers "provider not configured".</summary>
public sealed class FacebookIdentityVerifier : IExternalIdentityVerifier
{
    public const string DiscoveryUrl = "https://www.facebook.com/.well-known/openid-configuration/";
    public const string Issuer = "https://www.facebook.com";

    private readonly OidcIdTokenVerifier _inner;

    public FacebookIdentityVerifier(
        IReadOnlyCollection<string> appIds,
        Func<CancellationToken, Task<IReadOnlyCollection<SecurityKey>>> signingKeys,
        Func<Task>? onUnknownKey = null) =>
        _inner = new OidcIdTokenVerifier("facebook", [Issuer], appIds, signingKeys, onUnknownKey);

    public string Provider => _inner.Provider;
    public bool IsConfigured => _inner.IsConfigured;

    public async Task<ExternalIdentity?> VerifyAsync(string idToken, string? expectedNonce, CancellationToken ct)
    {
        var identity = await _inner.VerifyAsync(idToken, expectedNonce, ct);
        return identity is null ? null : identity with { EmailVerified = false };
    }

    public static IExternalIdentityVerifier Create(string? appIdsSetting, HttpClient? http = null)
    {
        var appIds = (appIdsSetting ?? "").Split([',', ' ', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var keys = new ConfigurationManager<OpenIdConnectConfiguration>(
            DiscoveryUrl, new OpenIdConnectConfigurationRetriever(),
            http is null ? new HttpDocumentRetriever { RequireHttps = true } : new HttpDocumentRetriever(http) { RequireHttps = true });

        return new FacebookIdentityVerifier(
            appIds,
            async ct => (await keys.GetConfigurationAsync(ct)).SigningKeys.ToArray(),
            onUnknownKey: () => { keys.RequestRefresh(); return Task.CompletedTask; });
    }
}
