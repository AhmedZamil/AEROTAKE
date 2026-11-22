using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P0-9 / P0-10: a token is accepted only for the audience it was issued for AND only if it was signed
/// by that audience's key. Each rejection here is isolated: the token differs from the accepted control in exactly
/// one respect, so a 401 can only mean that one check works.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class JwtAudienceTests(OtaCoreEngineFixture fixture)
{
    private async Task<HttpStatusCode> CallAsync(string token, Guid agentId)
    {
        var client = fixture.Factory.CreateAuthenticatedClient(token);
        return (await client.GetAsync($"/api/v1/agents/{agentId}/credit")).StatusCode;
    }

    [Fact]
    public async Task Control_AValidAgentToken_IsAccepted()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.OK, await CallAsync(TestJwtKeys.Token(tenantId, agentId), agentId));
    }

    [Theory]
    [InlineData(TokenAudiences.Customers)]
    [InlineData(TokenAudiences.Internal)]
    public async Task AGenuineTokenForAnotherAudience_SignedByThatAudiencesOwnKey_IsRejectedByTheAgentApi(string audience)
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var signer = audience == TokenAudiences.Customers ? TestJwtKeys.CustomersSigning() : TestJwtKeys.InternalSigning();

        // Valid signature (by the customers/internal key), valid claims — only the audience is wrong for this API.
        Assert.Equal(HttpStatusCode.Unauthorized, await CallAsync(TestJwtKeys.Token(tenantId, agentId, audience, signer), agentId));
    }

    [Fact]
    public async Task TheLegacyAudienceFromBeforeP09_IsRejected()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.Unauthorized, await CallAsync(TestJwtKeys.Token(tenantId, agentId, "ota-platform"), agentId));
    }

    [Fact]
    public async Task AnAgentAudienceToken_SignedByAnotherAudiencesKey_IsRejected_KeysAreBoundToTheirAudience()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        // Claims to be an agents token but is signed with the CUSTOMERS key, even naming that key's kid.
        var token = TestJwtKeys.Token(tenantId, agentId, TokenAudiences.Agents, TestJwtKeys.CustomersSigning());

        Assert.Equal(HttpStatusCode.Unauthorized, await CallAsync(token, agentId));
    }

    [Fact]
    public async Task AnAgentAudienceToken_SignedByAStranger_EvenWithTheRightKid_IsRejected()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        var token = TestJwtKeys.Token(tenantId, agentId, TokenAudiences.Agents, TestJwtKeys.StrangerSigning(TestJwtKeys.AgentsKid));

        Assert.Equal(HttpStatusCode.Unauthorized, await CallAsync(token, agentId));
    }

    [Fact]
    public async Task AnHmacTokenSignedWithAGuessableSecret_IsRejected_NoAlgorithmConfusion()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        // The exact shape every token had before P0-10, signed with the old well-known dev secret.
        var hs256 = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes("dev-only-signing-key-change-me-before-any-real-deployment")),
            SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken("ota-core-engine", TokenAudiences.Agents,
            [new Claim("tenant_id", tenantId), new Claim("agent_id", agentId.ToString()), new Claim("role", "AgencyAdmin"),
             new Claim("channel", "B2B_AGENT"), new Claim(ActorTypes.ClaimName, "agent"), new Claim("token_type", "access")],
            expires: DateTime.UtcNow.AddMinutes(5), signingCredentials: hs256);

        Assert.Equal(HttpStatusCode.Unauthorized, await CallAsync(new JwtSecurityTokenHandler().WriteToken(jwt), agentId));
    }

    [Fact]
    public async Task AnUnsignedToken_IsRejected()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var jwt = new JwtSecurityToken("ota-core-engine", TokenAudiences.Agents,
            [new Claim("tenant_id", tenantId), new Claim("agent_id", agentId.ToString()), new Claim("role", "AgencyAdmin"),
             new Claim("channel", "B2B_AGENT"), new Claim(ActorTypes.ClaimName, "agent"), new Claim("token_type", "access")],
            expires: DateTime.UtcNow.AddMinutes(5)); // no signing credentials => alg "none"

        Assert.Equal(HttpStatusCode.Unauthorized, await CallAsync(new JwtSecurityTokenHandler().WriteToken(jwt), agentId));
    }

    [Fact]
    public async Task AnExpiredToken_IsRejected()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var jwt = TestJwtKeys.Token(tenantId, agentId, expires: DateTime.UtcNow.AddMinutes(-10));

        Assert.Equal(HttpStatusCode.Unauthorized, await CallAsync(jwt, agentId));
    }

    [Fact]
    public async Task ATokenWithoutAnActorType_IsRejected()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.Unauthorized, await CallAsync(TestJwtKeys.Token(tenantId, agentId, actorType: null), agentId));
    }

    [Fact]
    public void ARefreshToken_IsOnlyAcceptedForTheAgentAudienceSignedByItsKey()
    {
        var service = new JwtTokenService(new ConfigurationBuilder().Build(), JwtKeyRing.FromJson(TestJwtKeys.ConfigJson));
        var t = "tenant";

        Assert.NotNull(service.ValidateRefreshToken(TestJwtKeys.Token(t, Guid.NewGuid(), tokenType: "refresh")));
        Assert.Null(service.ValidateRefreshToken(TestJwtKeys.Token(t, Guid.NewGuid(), TokenAudiences.Customers, TestJwtKeys.CustomersSigning(), tokenType: "refresh")));
        Assert.Null(service.ValidateRefreshToken(TestJwtKeys.Token(t, Guid.NewGuid(), tokenType: "refresh", signer: TestJwtKeys.StrangerSigning())));
    }
}
