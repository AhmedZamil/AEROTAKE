using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Tests.Fixtures;

/// <summary>Fixed ES256 keys for tests ONLY — generated once for this test project, never used anywhere real.
/// The app under test loads them through JWT_SIGNING_KEYS (see OtaCoreEngineFactory) so tests can also
/// hand-sign tokens with the same private key and prove a token is rejected for the RIGHT reason.</summary>
public static class TestJwtKeys
{
    public const string AgentsKid = "agents-test-1";
    private const string AgentsPrivate = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgYoiyp/HTwDK9inkTVTsty9BExuem2lkLwdoAP7EadPWhRANCAAQSWQx/eQKRu6DApLQZ3bWlkJcNMJ6XvSOOs7HZVpQNmnplwK4Rq9pBA85vQhW0Uxzii8bQ2m6f7wnNUZ0wo5mq";
    // A DIFFERENT valid P-256 key the app has never heard of — for "signed by a stranger" tests.
    private const string StrangerPrivate = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgWmi8jdidkkQfT3a+SzKdKcXCyp7Z40Z3Cfq//VEv1xqhRANCAAQf4vyBZPcKoi9sCTK5NTbfV7JZlhbXctqEDhHO+C/b1HY+BMDwaJA2GxazMbzlpIjbvFVpO4wN9aLWDls3KfbY";

    /// <summary>Value for the JWT_SIGNING_KEYS setting: an agents key (kid agents-test-1) plus customers and internal keys.</summary>
    public static readonly string ConfigJson = System.Text.Json.JsonSerializer.Serialize(new Dictionary<string, object>
    {
        [TokenAudiences.Agents] = new { active = AgentsKid, keys = new Dictionary<string, string> { [AgentsKid] = AgentsPrivate } },
        [TokenAudiences.Customers] = new { active = "customers-test-1", keys = new Dictionary<string, string> { ["customers-test-1"] = StrangerPrivate } },
        [TokenAudiences.Internal] = new { active = "internal-test-1", keys = new Dictionary<string, string> { ["internal-test-1"] = StrangerPrivate } },
    });

    public static SigningCredentials AgentsSigning() => Credentials(AgentsPrivate, AgentsKid);
    public static SigningCredentials StrangerSigning(string kid = AgentsKid) => Credentials(StrangerPrivate, kid);
    /// <summary>The customers/internal audiences' OWN valid keys — a token they sign is genuine for its own audience.</summary>
    public static SigningCredentials CustomersSigning() => Credentials(StrangerPrivate, "customers-test-1");
    public static SigningCredentials InternalSigning() => Credentials(StrangerPrivate, "internal-test-1");

    private static SigningCredentials Credentials(string base64Pkcs8, string kid)
    {
        var ecdsa = ECDsa.Create();
        ecdsa.ImportPkcs8PrivateKey(Convert.FromBase64String(base64Pkcs8), out _);
        return new SigningCredentials(new ECDsaSecurityKey(ecdsa) { KeyId = kid }, SecurityAlgorithms.EcdsaSha256);
    }

    /// <summary>A token with otherwise-valid agent claims; vary audience, signer, or claims to test one rejection at a time.</summary>
    public static string Token(string tenantId, Guid agentId, string audience = TokenAudiences.Agents, SigningCredentials? signer = null,
        string? actorType = "agent", string tokenType = "access", DateTime? expires = null)
    {
        var claims = new List<Claim>
        {
            new("sub", Guid.NewGuid().ToString()), new("jti", Guid.NewGuid().ToString()),
            new("tenant_id", tenantId), new("agent_id", agentId.ToString()),
            new("role", "AgencyAdmin"), new("channel", "B2B_AGENT"), new("token_type", tokenType),
        };
        if (actorType is not null) claims.Add(new Claim(ActorTypes.ClaimName, actorType));
        var jwt = new JwtSecurityToken(issuer: "ota-core-engine", audience: audience, claims: claims,
            expires: expires ?? DateTime.UtcNow.AddMinutes(5), signingCredentials: signer ?? AgentsSigning());
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }
}
