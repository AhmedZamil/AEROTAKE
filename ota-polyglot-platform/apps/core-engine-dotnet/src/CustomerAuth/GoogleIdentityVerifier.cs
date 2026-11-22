using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Ota.CoreEngine.CustomerAuth;

/// <summary>Google sign-in. The signing keys come from Google's OpenID discovery document (cached and refreshed by the
/// configuration manager); the audience is the OAuth client id(s) registered for this platform (GOOGLE_CLIENT_IDS, comma
/// separated — one per frontend/brand if they have separate Google apps). Until at least one client id is configured this
/// provider is off and sign-in answers "provider not configured".</summary>
public static class GoogleIdentityVerifier
{
    public const string DiscoveryUrl = "https://accounts.google.com/.well-known/openid-configuration";

    /// <summary>Google documents both spellings of its issuer.</summary>
    private static readonly string[] Issuers = ["https://accounts.google.com", "accounts.google.com"];

    public static IExternalIdentityVerifier Create(string? clientIdsSetting, HttpClient? http = null)
    {
        var clientIds = (clientIdsSetting ?? "").Split([',', ' ', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var keys = new ConfigurationManager<OpenIdConnectConfiguration>(
            DiscoveryUrl, new OpenIdConnectConfigurationRetriever(),
            http is null ? new HttpDocumentRetriever { RequireHttps = true } : new HttpDocumentRetriever(http) { RequireHttps = true });

        return new OidcIdTokenVerifier(
            "google", Issuers, clientIds,
            async ct => (await keys.GetConfigurationAsync(ct)).SigningKeys.ToArray(),
            onUnknownKey: () => { keys.RequestRefresh(); return Task.CompletedTask; });
    }
}
