using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tenancy;
using Xunit;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Tests.Unit;

/// <summary>Regression tests for the header-trust gap: on authenticated requests
/// tenant, channel and agent must come from the validated token, never from
/// X-Tenant-ID / X-Channel / X-Agent-Tier headers a caller can forge.</summary>
public class TenantResolutionMiddlewareTests
{
    private static readonly Guid AgentId = Guid.NewGuid();

    private static (DefaultHttpContext Http, TenantAccessor Accessor) Arrange(
        IEnumerable<Claim>? claims, Dictionary<string, string>? headers = null)
    {
        var http = new DefaultHttpContext();
        http.Response.Body = new MemoryStream();
        http.Request.Path = "/api/v1/agents";
        foreach (var (k, v) in headers ?? []) http.Request.Headers[k] = v;
        if (claims is not null)
            http.User = new ClaimsPrincipal(new ClaimsIdentity(claims, authenticationType: "test"));
        return (http, new TenantAccessor());
    }

    private static async Task<bool> RunAsync(DefaultHttpContext http, TenantAccessor accessor)
    {
        var nextCalled = false;
        var middleware = new TenantResolutionMiddleware(_ => { nextCalled = true; return Task.CompletedTask; });
        await middleware.InvokeAsync(http, accessor);
        return nextCalled;
    }

    private static Claim[] AgentClaims(string tenant = "tenant-a", string? channel = "B2B_AGENT", string? actorType = "agent")
    {
        var claims = new List<Claim> { new("tenant_id", tenant), new("agent_id", AgentId.ToString()) };
        if (channel is not null) claims.Add(new Claim(TenantResolutionMiddleware.ChannelClaim, channel));
        if (actorType is not null) claims.Add(new Claim(ActorTypes.ClaimName, actorType));
        return [.. claims];
    }

    [Fact]
    public async Task Authenticated_ForgedChannelTierAndTenantHeaders_AreIgnored()
    {
        var (http, accessor) = Arrange(AgentClaims(), new()
        {
            ["X-Channel"] = "B2C",
            ["X-Agent-Tier"] = "PLATINUM",
            ["X-Tenant-ID"] = "some-other-tenant",
        });

        Assert.True(await RunAsync(http, accessor));

        Assert.Equal("tenant-a", accessor.Current!.TenantId);
        Assert.Equal("B2B_AGENT", accessor.Current.Channel);
        Assert.Equal(AgentId, accessor.Current.AgentId);
        Assert.Equal("agent", accessor.Current.ActorType);
        Assert.Null(accessor.Current.AgentTier);
    }

    [Fact]
    public async Task Authenticated_WithoutActorTypeClaim_IsRejected()
    {
        var (http, accessor) = Arrange(AgentClaims(actorType: null));

        Assert.False(await RunAsync(http, accessor));

        Assert.Equal(StatusCodes.Status401Unauthorized, http.Response.StatusCode);
        Assert.Null(accessor.Current);
    }

    [Fact]
    public async Task Authenticated_WithoutChannelClaim_IsRejected_NotDefaultedToB2C()
    {
        var (http, accessor) = Arrange(AgentClaims(channel: null), new() { ["X-Channel"] = "B2B_AGENT" });

        Assert.False(await RunAsync(http, accessor));

        Assert.Equal(StatusCodes.Status401Unauthorized, http.Response.StatusCode);
        Assert.Null(accessor.Current);
    }

    [Fact]
    public async Task Authenticated_WithoutTenantClaim_IsRejected()
    {
        var (http, accessor) = Arrange(
            [new Claim(TenantResolutionMiddleware.ChannelClaim, "B2B_AGENT"), new Claim(ActorTypes.ClaimName, "agent")],
            new() { ["X-Tenant-ID"] = "tenant-a" });

        Assert.False(await RunAsync(http, accessor));

        Assert.Equal(StatusCodes.Status401Unauthorized, http.Response.StatusCode);
    }

    [Fact]
    public async Task Anonymous_ReadsOnlyTenantHeader_ChannelAndTierStayUnset()
    {
        var (http, accessor) = Arrange(null, new()
        {
            ["X-Tenant-ID"] = "tenant-a",
            ["X-Channel"] = "B2B_AGENT",
            ["X-Agent-Tier"] = "PLATINUM",
        });

        Assert.True(await RunAsync(http, accessor));

        Assert.Equal("tenant-a", accessor.Current!.TenantId);
        Assert.Null(accessor.Current.Channel);
        Assert.Null(accessor.Current.AgentTier);
    }

    [Fact]
    public async Task Anonymous_WithoutTenantHeader_IsRejected()
    {
        var (http, accessor) = Arrange(null);

        Assert.False(await RunAsync(http, accessor));

        Assert.Equal(StatusCodes.Status400BadRequest, http.Response.StatusCode);
    }

    private static string? ClaimFor(User user, string claimType, string? tokenKind = null)
    {
        var issued = new JwtTokenService(new ConfigurationBuilder().Build(), JwtKeyRing.FromJson(Fixtures.TestJwtKeys.ConfigJson)).IssueTokens(user);
        var token = tokenKind == "refresh" ? issued.RefreshToken : issued.AccessToken;
        var jwt = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(token);
        return claimType == "aud" ? jwt.Audiences.SingleOrDefault() : jwt.Claims.FirstOrDefault(c => c.Type == claimType)?.Value;
    }

    [Fact]
    public void IssuedToken_CarriesChannelClaim_FromTheUsersAgentLink()
    {
        var agentUser = new User { TenantId = "t", Email = "a@x", PasswordHash = "h", FirstName = "A", LastName = "B", AgentId = Guid.NewGuid() };
        var admin = new User { TenantId = "t", Email = "b@x", PasswordHash = "h", FirstName = "A", LastName = "B", Role = UserRole.Admin };

        Assert.Equal("B2B_AGENT", ClaimFor(agentUser, TenantResolutionMiddleware.ChannelClaim));
        Assert.Equal("PLATFORM", ClaimFor(admin, TenantResolutionMiddleware.ChannelClaim));
    }

    [Fact]
    public void IssuedTokens_AreForTheAgentAudienceWithAgentActorType_AccessAndRefresh()
    {
        var user = new User { TenantId = "t", Email = "a@x", PasswordHash = "h", FirstName = "A", LastName = "B", AgentId = Guid.NewGuid() };

        foreach (var kind in new[] { "access", "refresh" })
        {
            Assert.Equal(TokenAudiences.Agents, ClaimFor(user, "aud", kind));
            Assert.Equal(ActorTypes.Agent, ClaimFor(user, ActorTypes.ClaimName, kind));
        }
    }
}
