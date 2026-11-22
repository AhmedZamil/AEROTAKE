using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;

namespace Ota.CoreEngine.Auth;

/// <summary>The signing and verification keys, grouped by token audience. Only core-engine holds
/// private keys; everything else verifies with the public halves published as a JWKS.
///
/// Keys are bound to an audience: a token claiming audience X is only ever checked against X's
/// keys, so a key that leaks for one kind of caller can't mint tokens for another.
///
/// Only ES256 (ECDSA P-256) exists here on purpose. Accepting a fixed algorithm — never one read
/// from the token — is what prevents algorithm-confusion attacks.</summary>
public interface IJwtKeyRing
{
    /// <summary>Credentials for signing a new token for this audience (the active key, with its kid in the header).</summary>
    SigningCredentials SigningCredentialsFor(string audience);

    /// <summary>Keys that may verify a token for this audience. When the token names a kid, only that key;
    /// unknown kid or unknown audience yields nothing, so validation fails.</summary>
    IReadOnlyList<SecurityKey> ValidationKeysFor(string? audience, string? kid);

    /// <summary>Public JWKS document (no private material) for the frontends to fetch.</summary>
    object PublicJwks();

    /// <summary>"audience=kid" per active key, for the startup log.</summary>
    IEnumerable<string> ActiveKeyIds { get; }
}

public sealed class JwtKeyRing : IJwtKeyRing
{
    public const string Algorithm = SecurityAlgorithms.EcdsaSha256; // ES256
    private const string P256Oid = "1.2.840.10045.3.1.7";
    /// <summary>JWKS member naming the audience a key is for (a private-use parameter; verifiers must honour it).</summary>
    public const string AudienceMember = "ota_aud";

    private sealed record Entry(string Kid, ECDsaSecurityKey Key, bool CanSign);

    private readonly Dictionary<string, (string ActiveKid, List<Entry> Entries)> _byAudience = new();

    private JwtKeyRing() { }

    /// <summary>Parses the JWT_SIGNING_KEYS value: {"aud":{"active":"kid","keys":{"kid":"base64 PKCS#8 private | base64 SPKI public"}}}.</summary>
    public static JwtKeyRing FromJson(string json)
    {
        var ring = new JwtKeyRing();
        using var doc = JsonDocument.Parse(json);
        foreach (var audience in doc.RootElement.EnumerateObject())
        {
            var active = audience.Value.GetProperty("active").GetString()
                ?? throw new InvalidOperationException($"JWT_SIGNING_KEYS: '{audience.Name}' has no active kid.");
            var entries = new List<Entry>();
            foreach (var k in audience.Value.GetProperty("keys").EnumerateObject())
            {
                var (ecdsa, canSign) = Import(k.Value.GetString() ?? "", audience.Name, k.Name);
                entries.Add(new Entry(k.Name, new ECDsaSecurityKey(ecdsa) { KeyId = k.Name }, canSign));
            }
            var current = entries.FirstOrDefault(e => e.Kid == active)
                ?? throw new InvalidOperationException($"JWT_SIGNING_KEYS: active kid '{active}' is not among '{audience.Name}' keys.");
            if (!current.CanSign)
                throw new InvalidOperationException($"JWT_SIGNING_KEYS: active key '{active}' for '{audience.Name}' must be a private key.");
            ring._byAudience[audience.Name] = (active, entries);
        }
        if (ring._byAudience.Count == 0) throw new InvalidOperationException("JWT_SIGNING_KEYS defines no audiences.");
        return ring;
    }

    /// <summary>Fresh in-memory keys — Development and tests only. They vanish on restart, so every
    /// issued token stops verifying; production must supply JWT_SIGNING_KEYS.</summary>
    public static JwtKeyRing Ephemeral(IEnumerable<string> audiences)
    {
        var ring = new JwtKeyRing();
        foreach (var audience in audiences)
        {
            var kid = $"{audience.Replace("ota-", "")}-ephemeral-{Guid.NewGuid():N}"[..28];
            var key = new ECDsaSecurityKey(ECDsa.Create(ECCurve.NamedCurves.nistP256)) { KeyId = kid };
            ring._byAudience[audience] = (kid, [new Entry(kid, key, true)]);
        }
        return ring;
    }

    private static (ECDsa Key, bool CanSign) Import(string base64, string audience, string kid)
    {
        byte[] der;
        try { der = Convert.FromBase64String(base64); }
        catch (FormatException) { throw new InvalidOperationException($"JWT_SIGNING_KEYS: key '{kid}' for '{audience}' is not valid base64."); }

        var ecdsa = ECDsa.Create();
        bool canSign;
        try { ecdsa.ImportPkcs8PrivateKey(der, out _); canSign = true; }
        catch (CryptographicException)
        {
            try { ecdsa.ImportSubjectPublicKeyInfo(der, out _); canSign = false; }
            catch (CryptographicException) { throw new InvalidOperationException($"JWT_SIGNING_KEYS: key '{kid}' for '{audience}' is neither a PKCS#8 private key nor a SubjectPublicKeyInfo public key."); }
        }
        if (ecdsa.ExportParameters(false).Curve.Oid.Value != P256Oid)
            throw new InvalidOperationException($"JWT_SIGNING_KEYS: key '{kid}' for '{audience}' is not on curve P-256 (ES256).");
        return (ecdsa, canSign);
    }

    public SigningCredentials SigningCredentialsFor(string audience)
    {
        if (!_byAudience.TryGetValue(audience, out var set))
            throw new InvalidOperationException($"No signing key configured for audience '{audience}'.");
        return new SigningCredentials(set.Entries.First(e => e.Kid == set.ActiveKid).Key, Algorithm);
    }

    public IReadOnlyList<SecurityKey> ValidationKeysFor(string? audience, string? kid)
    {
        if (audience is null || !_byAudience.TryGetValue(audience, out var set)) return [];
        return set.Entries.Where(e => kid is null || e.Kid == kid).Select(e => (SecurityKey)e.Key).ToList();
    }

    public object PublicJwks() => new
    {
        keys = _byAudience.SelectMany(a => a.Value.Entries.Select(e =>
        {
            var p = ((ECDsaSecurityKey)e.Key).ECDsa.ExportParameters(false);
            return new Dictionary<string, string>
            {
                ["kty"] = "EC", ["crv"] = "P-256", ["use"] = "sig", ["alg"] = "ES256",
                ["kid"] = e.Kid,
                ["x"] = Base64UrlEncoder.Encode(p.Q.X!), ["y"] = Base64UrlEncoder.Encode(p.Q.Y!),
                [AudienceMember] = a.Key,
            };
        })).ToList(),
    };

    public IEnumerable<string> ActiveKeyIds => _byAudience.Select(a => $"{a.Key}={a.Value.ActiveKid}");

    /// <summary>Resolver shared by the API's JwtBearer pipeline and refresh-token validation: narrows the
    /// candidate keys to the audience (and kid) the token itself names.</summary>
    public static IEnumerable<SecurityKey> Resolve(IJwtKeyRing ring, SecurityToken token, string? kid) =>
        ring.ValidationKeysFor(
            token switch
            {
                Microsoft.IdentityModel.JsonWebTokens.JsonWebToken j => j.Audiences.FirstOrDefault(),
                System.IdentityModel.Tokens.Jwt.JwtSecurityToken s => s.Audiences.FirstOrDefault(),
                _ => null,
            },
            kid);
}
