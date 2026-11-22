using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Unit;

/// <summary>P3-1: the check that decides whether to believe a sign-in at all. Each rejection differs from the accepted control in
/// exactly ONE way, so a null can only mean that one check works.</summary>
public class OidcIdTokenVerifierTests
{
    private readonly TestIdp _idp = new();
    private IExternalIdentityVerifier Verifier => _idp.Verifier();

    [Fact]
    public async Task Control_AGenuineToken_ForThisPlatform_IsAccepted()
    {
        var identity = await Verifier.VerifyAsync(_idp.IdToken("sub-1", "Sam@Example.test", emailVerified: true, givenName: "Sam", familyName: "Rahman"), null, default);

        Assert.NotNull(identity);
        Assert.Equal(("google", "sub-1", "Sam@Example.test", true, "Sam", "Rahman"),
            (identity.Provider, identity.Subject, identity.Email, identity.EmailVerified, identity.GivenName, identity.FamilyName));
    }

    [Fact]
    public async Task ATokenForAnotherApp_IsRejected_SoATokenGivenToSomeoneElseCannotBeReplayedHere() =>
        Assert.Null(await Verifier.VerifyAsync(_idp.IdToken("sub-1", audience: "some-other-apps-client-id"), null, default));

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("https://accounts.google.com.evil.example")]
    public async Task ATokenFromAnotherIssuer_IsRejected(string issuer) =>
        Assert.Null(await Verifier.VerifyAsync(_idp.IdToken("sub-1", issuer: issuer), null, default));

    [Fact]
    public async Task BothOfGooglesIssuerSpellings_AreAccepted() =>
        Assert.NotNull(await Verifier.VerifyAsync(_idp.IdToken("sub-1", issuer: "accounts.google.com"), null, default));

    [Fact]
    public async Task AnExpiredToken_IsRejected() =>
        Assert.Null(await Verifier.VerifyAsync(_idp.IdToken("sub-1", lifetime: TimeSpan.FromMinutes(-10)), null, default));

    [Fact]
    public async Task ATokenSignedByAStranger_EvenNamingTheRightKeyId_IsRejected() =>
        Assert.Null(await Verifier.VerifyAsync(_idp.IdToken("sub-1", signer: _idp.Stranger), null, default));

    [Fact]
    public async Task AnUnsignedToken_IsRejected() =>
        Assert.Null(await Verifier.VerifyAsync(_idp.UnsignedToken("sub-1"), null, default));

    [Fact]
    public async Task AnHmacToken_SignedWithPublicKeyMaterial_IsRejected_NoAlgorithmConfusion()
    {
        var hs = new SigningCredentials(new SymmetricSecurityKey(new byte[32]), SecurityAlgorithms.HmacSha256);

        Assert.Null(await Verifier.VerifyAsync(_idp.IdToken("sub-1", signer: hs), null, default));
    }

    [Fact]
    public async Task ATokenWithNoSubject_IsRejected() =>
        Assert.Null(await Verifier.VerifyAsync(_idp.IdToken("x", includeSubject: false), null, default));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not.a.jwt")]
    [InlineData("garbage")]
    public async Task Junk_IsRejected_WithoutThrowing(string token) =>
        Assert.Null(await Verifier.VerifyAsync(token, null, default));

    [Fact]
    public async Task ANonce_WhenTheCallerSuppliesOne_MustMatch()
    {
        var token = _idp.IdToken("sub-1", nonce: "abc123");

        Assert.NotNull(await Verifier.VerifyAsync(token, "abc123", default));
        Assert.Null(await Verifier.VerifyAsync(token, "different", default));
        Assert.Null(await Verifier.VerifyAsync(_idp.IdToken("sub-1"), "abc123", default)); // token has no nonce at all
        Assert.NotNull(await Verifier.VerifyAsync(token, null, default));                  // caller did not ask for one
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData("true", true)]
    [InlineData("TRUE", true)]
    [InlineData(false, false)]
    [InlineData("false", false)]
    [InlineData("yes", false)]
    public async Task EmailVerified_IsOnlyTrueWhenTheProviderReallySaysSo(object claim, bool expected)
    {
        var identity = await Verifier.VerifyAsync(_idp.IdToken("sub-1", "a@example.test", emailVerified: claim), null, default);

        Assert.Equal(expected, identity!.EmailVerified);
    }

    [Fact]
    public async Task AMissingEmailVerifiedClaim_MeansNotVerified()
    {
        var identity = await Verifier.VerifyAsync(_idp.IdToken("sub-1", "a@example.test"), null, default);

        Assert.False(identity!.EmailVerified);
    }

    [Fact]
    public async Task AVerifierWithNoClientIdConfigured_AcceptsNothing()
    {
        var unconfigured = _idp.Verifier(clientId: "");

        Assert.False(unconfigured.IsConfigured);
        Assert.Null(await unconfigured.VerifyAsync(_idp.IdToken("sub-1"), null, default));
    }

    [Fact]
    public async Task WhenTheKeyIsUnknown_TheKeysAreRefreshedOnce_AndTheTokenRetried()
    {
        // The provider rotated: the verifier's key list is stale until it is refreshed.
        var rotated = new TestIdp();
        var stale = new List<SecurityKey> { _idp.PublicKey };
        var refreshes = 0;
        var verifier = new OidcIdTokenVerifier("google", [TestIdp.Issuer], [TestIdp.ClientId],
            _ => Task.FromResult<IReadOnlyCollection<SecurityKey>>(stale.ToArray()),
            onUnknownKey: () => { refreshes++; stale.Clear(); stale.Add(rotated.PublicKey); return Task.CompletedTask; });

        var identity = await verifier.VerifyAsync(rotated.IdToken("sub-1"), null, default);

        Assert.NotNull(identity);
        Assert.Equal(1, refreshes);
    }

    [Fact]
    public async Task AForgedToken_TriggersAtMostOneRefresh_ThenIsRejected()
    {
        var refreshes = 0;
        var verifier = _idp.Verifier(onUnknownKey: () => { refreshes++; return Task.CompletedTask; });

        Assert.Null(await verifier.VerifyAsync(_idp.IdToken("sub-1", signer: _idp.Stranger), null, default));
        Assert.Equal(1, refreshes); // bounded: a flood of forged tokens is one refresh each, not an unbounded loop
    }
}
