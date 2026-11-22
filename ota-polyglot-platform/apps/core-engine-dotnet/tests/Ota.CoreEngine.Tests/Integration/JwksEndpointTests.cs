using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

[Collection(OtaCoreEngineCollection.Name)]
public class JwksEndpointTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public async Task Jwks_IsAnonymous_PublicOnly_AndCacheable()
    {
        var response = await fixture.Factory.CreateClient().GetAsync("/.well-known/jwks.json"); // no token, no X-Tenant-ID

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("public", response.Headers.CacheControl!.ToString());
        var body = await response.Content.ReadAsStringAsync();
        var keys = JsonDocument.Parse(body).RootElement.GetProperty("keys").EnumerateArray().ToList();
        Assert.Contains(keys, k => k.GetProperty("kid").GetString() == TestJwtKeys.AgentsKid
                                   && k.GetProperty(JwtKeyRing.AudienceMember).GetString() == TokenAudiences.Agents);
        Assert.All(keys, k => Assert.False(k.TryGetProperty("d", out _)));
    }

    [Fact]
    public async Task ATokenIssuedByTheRealApp_VerifiesUsingOnlyThePublishedJwks_LikeAFrontendWould()
    {
        var (_, _, accessToken) = await TestData.SeedAgentAsync(fixture.Factory); // issued by the app's own JwtTokenService
        var jwks = await fixture.Factory.CreateClient().GetStringAsync("/.well-known/jwks.json");
        var key = JsonDocument.Parse(jwks).RootElement.GetProperty("keys").EnumerateArray()
            .Single(k => k.GetProperty(JwtKeyRing.AudienceMember).GetString() == TokenAudiences.Agents);

        var kid = new JwtSecurityTokenHandler().ReadJwtToken(accessToken).Header.Kid;
        Assert.Equal(key.GetProperty("kid").GetString(), kid);

        var verifier = new JsonWebKey(key.GetRawText());
        new JwtSecurityTokenHandler().ValidateToken(accessToken, new TokenValidationParameters
        {
            ValidIssuer = "ota-core-engine", ValidAudience = TokenAudiences.Agents,
            IssuerSigningKey = verifier, ValidAlgorithms = ["ES256"],
        }, out var validated);
        Assert.NotNull(validated);
    }
}
