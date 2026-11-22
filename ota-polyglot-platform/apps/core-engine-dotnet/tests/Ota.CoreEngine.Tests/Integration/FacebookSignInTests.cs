using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P3-6: Facebook sign-in, against the stand-in provider (real verification code, real keys). NOT verified against Facebook
/// itself — that needs a registered Meta app and one real token (see the tracker).</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class FacebookSignInTests(OtaCoreEngineFixture fixture)
{
    private const string FbIssuer = FacebookIdentityVerifier.Issuer;
    private readonly TestIdp _idp = new();

    private string FbToken(string sub, string? email = null, object? emailVerified = null, string? audience = null, string? issuer = null, string? nonce = null) =>
        _idp.IdToken(sub, email, emailVerified, nonce, audience ?? TestIdp.FacebookAppId, issuer ?? FbIssuer, givenName: "Fay", familyName: "Khan");

    private WebApplicationFactory<Program> Factory(string appId = TestIdp.FacebookAppId) => fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
    {
        s.RemoveAll<IExternalIdentityVerifier>();
        s.AddSingleton(_idp.Verifier());                  // google, so the two providers coexist as in production
        s.AddSingleton(_idp.FacebookVerifier(appId));
    }));

    // ------------------------------------------------------------------------------------------ the verifier

    [Fact]
    public async Task AValidToken_YieldsAFacebookIdentity()
    {
        var id = await _idp.FacebookVerifier().VerifyAsync(FbToken("fb-1", "f@example.test"), null, default);

        Assert.NotNull(id);
        Assert.Equal(("facebook", "fb-1", "f@example.test", "Fay", "Khan"), (id!.Provider, id.Subject, id.Email, id.GivenName, id.FamilyName));
    }

    [Theory]
    [InlineData(true)]
    [InlineData("true")]
    [InlineData(null)]
    public async Task AFacebookEmail_IsNeverVerified_EvenIfTheTokenSaysSo(object? claim)
    {
        var id = await _idp.FacebookVerifier().VerifyAsync(FbToken("fb-2", "f@example.test", claim), null, default);

        Assert.False(id!.EmailVerified);
    }

    [Fact]
    public async Task ATokenForAnotherApp_ForAnotherIssuer_OrWithADifferentNonce_IsRejected()
    {
        var verifier = _idp.FacebookVerifier();

        Assert.Null(await verifier.VerifyAsync(FbToken("fb-3", audience: "someone-elses-app"), null, default));
        Assert.Null(await verifier.VerifyAsync(FbToken("fb-3", issuer: "https://accounts.google.com"), null, default));   // a Google token is not a Facebook token
        Assert.Null(await verifier.VerifyAsync(FbToken("fb-3", nonce: "n1"), "n2", default));
        Assert.Null(await verifier.VerifyAsync(_idp.IdToken("fb-3", audience: TestIdp.FacebookAppId, issuer: FbIssuer, signer: _idp.Stranger), null, default));
        Assert.NotNull(await verifier.VerifyAsync(FbToken("fb-3", nonce: "n1"), "n1", default));
    }

    [Fact]
    public void WithoutAnAppId_TheProviderIsNotConfigured()
    {
        Assert.False(_idp.FacebookVerifier("").IsConfigured);
        Assert.True(_idp.FacebookVerifier().IsConfigured);
        Assert.False(FacebookIdentityVerifier.Create(null).IsConfigured);
    }

    // ------------------------------------------------------------------------------------------ the account rules, through the endpoint

    private async Task<HttpResponseMessage> PostAsync(WebApplicationFactory<Program> f, string tenant, string provider, string token)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        return await client.PostAsJsonAsync("/api/v1/auth/customer/social", new { provider, idToken = token });
    }

    [Fact]
    public async Task SigningInWithFacebook_CreatesACustomer_AndAReturnVisitIsTheSameOne()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var f = Factory();

        var first = await PostAsync(f, tenant, "facebook", FbToken("fb-4", "f4@example.test"));
        var second = await PostAsync(f, tenant, "facebook", FbToken("fb-4", "f4@example.test"));

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var (a, b) = (await first.Content.ReadFromJsonAsync<JsonElement>(), await second.Content.ReadFromJsonAsync<JsonElement>());
        Assert.True(a.GetProperty("isNewCustomer").GetBoolean());
        Assert.False(b.GetProperty("isNewCustomer").GetBoolean());
        Assert.Equal(a.GetProperty("customer").GetProperty("id").GetString(), b.GetProperty("customer").GetProperty("id").GetString());
        Assert.Equal(JsonValueKind.Null, a.GetProperty("customer").GetProperty("email").ValueKind);   // an unverified email is not adopted
    }

    [Fact]
    public async Task AFacebookLogin_CannotJoinAnExistingCustomer_ByClaimingTheirEmail()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var f = Factory();
        var email = $"victim-{Guid.NewGuid():N}@example.test";
        var victim = await PostAsync(f, tenant, "google", _idp.IdToken("g-victim", email, true));            // a verified Google customer
        var victimId = (await victim.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("customer").GetProperty("id").GetString();

        var attacker = await PostAsync(f, tenant, "facebook", FbToken("fb-attacker", email));                // a Facebook profile that merely lists that address

        Assert.Equal(HttpStatusCode.OK, attacker.StatusCode);
        var attackerId = (await attacker.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("customer").GetProperty("id").GetString();
        Assert.NotEqual(victimId, attackerId);
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        Assert.Equal(1, await db.CustomerIdentities.CountAsync(i => i.CustomerId == Guid.Parse(victimId!)));   // the victim gained no identity
    }

    [Fact]
    public async Task WithoutAnAppId_FacebookAnswers503_NotAnInvalidToken()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        var response = await PostAsync(Factory(appId: ""), tenant, "facebook", FbToken("fb-5"));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task AGoogleToken_SentAsFacebook_IsRejected()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        var response = await PostAsync(Factory(), tenant, "facebook", _idp.IdToken("g-1", "g@example.test", true));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
