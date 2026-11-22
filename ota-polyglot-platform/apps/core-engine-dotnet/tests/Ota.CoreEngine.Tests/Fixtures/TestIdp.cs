using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.CustomerAuth;

namespace Ota.CoreEngine.Tests.Fixtures;

/// <summary>A stand-in identity provider (a Google look-alike) so the real verification code runs against real cryptography:
/// it holds an RSA key, publishes the public half to the verifier, and mints ID tokens shaped like Google's. Every knob a test
/// needs to make a token INVALID in exactly one way is a parameter.</summary>
public sealed class TestIdp
{
    public const string ClientId = "test-google-client-id.apps.googleusercontent.com";
    public const string Issuer = "https://accounts.google.com";
    public const string KeyId = "idp-key-1";

    private readonly RSA _rsa = RSA.Create(2048);
    private readonly RSA _strangerRsa = RSA.Create(2048);

    public RsaSecurityKey PublicKey => new(_rsa.ExportParameters(false)) { KeyId = KeyId };
    public SigningCredentials Signer => new(new RsaSecurityKey(_rsa) { KeyId = KeyId }, SecurityAlgorithms.RsaSha256);

    /// <summary>A key the verifier has never been told about, claiming the real key id.</summary>
    public SigningCredentials Stranger => new(new RsaSecurityKey(_strangerRsa) { KeyId = KeyId }, SecurityAlgorithms.RsaSha256);

    /// <summary>The real verifier, pointed at this provider's key instead of Google's.</summary>
    public IExternalIdentityVerifier Verifier(Func<Task>? onUnknownKey = null, string clientId = ClientId) =>
        new OidcIdTokenVerifier("google", [Issuer, "accounts.google.com"], clientId.Length == 0 ? [] : [clientId],
            _ => Task.FromResult<IReadOnlyCollection<SecurityKey>>([PublicKey]), onUnknownKey);

    /// <summary>The real Facebook verifier, pointed at this provider's key. Tokens are minted with issuer "https://www.facebook.com".</summary>
    public const string FacebookAppId = "test-facebook-app-id";
    public IExternalIdentityVerifier FacebookVerifier(string appId = FacebookAppId) =>
        new FacebookIdentityVerifier(appId.Length == 0 ? [] : [appId], _ => Task.FromResult<IReadOnlyCollection<SecurityKey>>([PublicKey]));

    public string IdToken(
        string subject, string? email = null, object? emailVerified = null, string? nonce = null,
        string? audience = null, string? issuer = null, TimeSpan? lifetime = null, SigningCredentials? signer = null,
        string? givenName = null, string? familyName = null, bool includeSubject = true)
    {
        var claims = new Dictionary<string, object>();
        if (includeSubject) claims["sub"] = subject;
        if (email is not null) claims["email"] = email;
        if (emailVerified is not null) claims["email_verified"] = emailVerified;
        if (nonce is not null) claims["nonce"] = nonce;
        if (givenName is not null) claims["given_name"] = givenName;
        if (familyName is not null) claims["family_name"] = familyName;

        var life = lifetime ?? TimeSpan.FromMinutes(30);
        var now = DateTime.UtcNow;
        var (notBefore, expires) = life > TimeSpan.Zero ? (now, now + life) : (now + life - TimeSpan.FromHours(1), now + life); // negative = already expired
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer ?? Issuer, Audience = audience ?? ClientId, Claims = claims,
            NotBefore = notBefore, IssuedAt = notBefore, Expires = expires, SigningCredentials = signer ?? Signer,
        });
    }

    /// <summary>A token whose header says alg "none" and carries no signature at all.</summary>
    public string UnsignedToken(string subject)
    {
        static string B64(string s) => Base64UrlEncoder.Encode(Encoding.UTF8.GetBytes(s));
        var exp = DateTimeOffset.UtcNow.AddMinutes(30).ToUnixTimeSeconds();
        return $"{B64("{\"alg\":\"none\",\"typ\":\"JWT\"}")}.{B64($"{{\"iss\":\"{Issuer}\",\"aud\":\"{ClientId}\",\"sub\":\"{subject}\",\"exp\":{exp}}}")}.";
    }
}
