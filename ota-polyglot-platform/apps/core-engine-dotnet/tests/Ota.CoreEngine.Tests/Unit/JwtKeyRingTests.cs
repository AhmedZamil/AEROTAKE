using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Domain;
using Xunit;

namespace Ota.CoreEngine.Tests.Unit;

public class JwtKeyRingTests
{
    private static (string Pkcs8, string Spki) NewKey(ECCurve? curve = null)
    {
        using var k = ECDsa.Create(curve ?? ECCurve.NamedCurves.nistP256);
        return (Convert.ToBase64String(k.ExportPkcs8PrivateKey()), Convert.ToBase64String(k.ExportSubjectPublicKeyInfo()));
    }

    private static string Config(string active, Dictionary<string, string> keys, string audience = TokenAudiences.Agents) =>
        JsonSerializer.Serialize(new Dictionary<string, object> { [audience] = new { active, keys } });

    private static JwtTokenService Service(JwtKeyRing ring) => new(new ConfigurationBuilder().Build(), ring);

    private static readonly User Agent = new()
    { TenantId = "t", Email = "a@x", PasswordHash = "h", FirstName = "A", LastName = "B", AgentId = Guid.NewGuid() };

    [Fact]
    public void IssuedToken_IsEs256_AndNamesTheActiveKey()
    {
        var (priv, _) = NewKey();
        var ring = JwtKeyRing.FromJson(Config("k1", new() { ["k1"] = priv }));

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(Service(ring).IssueTokens(Agent).AccessToken);

        Assert.Equal("ES256", jwt.Header.Alg);
        Assert.Equal("k1", jwt.Header.Kid);
    }

    [Fact]
    public void PublicJwks_ContainsPublicMaterialOnly()
    {
        var (priv, _) = NewKey();
        var ring = JwtKeyRing.FromJson(Config("k1", new() { ["k1"] = priv }));

        var json = JsonSerializer.Serialize(ring.PublicJwks());
        var key = JsonDocument.Parse(json).RootElement.GetProperty("keys")[0];

        Assert.Equal("EC", key.GetProperty("kty").GetString());
        Assert.Equal("P-256", key.GetProperty("crv").GetString());
        Assert.Equal("k1", key.GetProperty("kid").GetString());
        Assert.Equal(TokenAudiences.Agents, key.GetProperty(JwtKeyRing.AudienceMember).GetString());
        Assert.False(key.TryGetProperty("d", out _), "the private scalar must never be published");
        Assert.DoesNotContain(priv, json);
    }

    [Fact]
    public void Rotation_TokensSignedByTheRetiredKey_KeepVerifying_UntilItIsRemoved()
    {
        var (oldPriv, oldPub) = NewKey();
        var (newPriv, _) = NewKey();
        var oldRing = JwtKeyRing.FromJson(Config("old", new() { ["old"] = oldPriv }));
        var oldRefresh = Service(oldRing).IssueTokens(Agent).RefreshToken;

        // Rotated: new key active, the old one kept as a PUBLIC key only.
        var rotated = JwtKeyRing.FromJson(Config("new", new() { ["new"] = newPriv, ["old"] = oldPub }));
        Assert.NotNull(Service(rotated).ValidateRefreshToken(oldRefresh));
        var fresh = new JwtSecurityTokenHandler().ReadJwtToken(Service(rotated).IssueTokens(Agent).AccessToken);
        Assert.Equal("new", fresh.Header.Kid); // new tokens use the new key, never the retired one

        // Retention window over: the old key is dropped and its tokens stop verifying.
        var pruned = JwtKeyRing.FromJson(Config("new", new() { ["new"] = newPriv }));
        Assert.Null(Service(pruned).ValidateRefreshToken(oldRefresh));
    }

    [Fact]
    public void ARetiredPublicKey_CanVerify_ButNeverSign()
    {
        var (priv, pub) = NewKey();
        var ring = JwtKeyRing.FromJson(Config("k1", new() { ["k1"] = priv, ["k0"] = pub }));

        Assert.Equal(2, ring.ValidationKeysFor(TokenAudiences.Agents, null).Count);
        Assert.Equal("k1", ring.SigningCredentialsFor(TokenAudiences.Agents).Key.KeyId);
    }

    [Fact]
    public void TheActiveKey_MustBeAPrivateKey()
    {
        var (_, pub) = NewKey();
        Assert.Throws<InvalidOperationException>(() => JwtKeyRing.FromJson(Config("k1", new() { ["k1"] = pub })));
    }

    [Fact]
    public void TheActiveKid_MustExist()
    {
        var (priv, _) = NewKey();
        Assert.Throws<InvalidOperationException>(() => JwtKeyRing.FromJson(Config("missing", new() { ["k1"] = priv })));
    }

    [Fact]
    public void AKeyOnTheWrongCurve_IsRejected()
    {
        var (p384, _) = NewKey(ECCurve.NamedCurves.nistP384);
        var ex = Assert.Throws<InvalidOperationException>(() => JwtKeyRing.FromJson(Config("k1", new() { ["k1"] = p384 })));
        Assert.Contains("P-256", ex.Message);
    }

    [Theory]
    [InlineData("not base64 at all!!")]
    [InlineData("AAAA")] // valid base64, not a key
    public void GarbageKeyMaterial_IsRejected_WithoutEchoingTheValue(string garbage)
    {
        var ex = Assert.Throws<InvalidOperationException>(() => JwtKeyRing.FromJson(Config("k1", new() { ["k1"] = garbage })));
        Assert.DoesNotContain(garbage, ex.Message);
    }

    [Fact]
    public void UnknownAudienceOrKid_YieldsNoKeys_AndSigningForAnUnconfiguredAudienceThrows()
    {
        var (priv, _) = NewKey();
        var ring = JwtKeyRing.FromJson(Config("k1", new() { ["k1"] = priv }));

        Assert.Empty(ring.ValidationKeysFor(TokenAudiences.Customers, null));
        Assert.Empty(ring.ValidationKeysFor(TokenAudiences.Agents, "nope"));
        Assert.Empty(ring.ValidationKeysFor(null, "k1"));
        Assert.Throws<InvalidOperationException>(() => ring.SigningCredentialsFor(TokenAudiences.Customers));
    }
}
