using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Auth;

/// <summary>Authentication and authorization for the gRPC surface. A separate scheme from the REST API's because
/// it accepts two kinds of caller: a logged-in agent (audience ota-agents) and a frontend service acting for an
/// anonymous visitor (audience ota-internal). What each may call is decided per RPC by the policies below.</summary>
public static class GrpcAuth
{
    public const string Scheme = "GrpcBearer";

    public static class Policies
    {
        /// <summary>Only a logged-in agent: anything that books or moves money.</summary>
        public const string Agent = "GrpcAgent";
        /// <summary>A logged-in agent, or a service holding the "search" scope.</summary>
        public const string Search = "GrpcSearch";
        /// <summary>A logged-in agent, or a service holding the "revalidate" scope.</summary>
        public const string Revalidate = "GrpcRevalidate";
    }

    public static AuthenticationBuilder AddGrpcBearer(this AuthenticationBuilder auth) =>
        auth.AddJwtBearer(Scheme, _ => { });

    public static IServiceCollection ConfigureGrpcBearer(this IServiceCollection services)
    {
        services.AddOptions<JwtBearerOptions>(Scheme).Configure<IConfiguration, IJwtKeyRing>((o, config, keys) =>
        {
            o.MapInboundClaims = false; // claim names stay exactly as issued (scope, tenants, ...)
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = config["Jwt:Issuer"] ?? "ota-core-engine",
                ValidAudiences = [TokenAudiences.Agents, TokenAudiences.Internal],
                IssuerSigningKeyResolver = (_, token, kid, _) => JwtKeyRing.Resolve(keys, token, kid),
                ValidAlgorithms = [JwtKeyRing.Algorithm],
                RequireSignedTokens = true,
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromSeconds(30),
            };
            o.Events = new JwtBearerEvents
            {
                // The audience, token type and actor type must agree, so e.g. a refresh token or a service
                // token can't be presented as a user's access token.
                OnTokenValidated = context =>
                {
                    var audience = context.SecurityToken switch
                    {
                        JsonWebToken j => j.Audiences.FirstOrDefault(),
                        JwtSecurityToken s => s.Audiences.FirstOrDefault(),
                        _ => null,
                    };
                    var tokenType = context.Principal?.FindFirst("token_type")?.Value;
                    var actor = context.Principal?.FindFirst(ActorTypes.ClaimName)?.Value;
                    var ok = (audience, tokenType, actor) switch
                    {
                        (TokenAudiences.Agents, "access", ActorTypes.Agent) => true,
                        (TokenAudiences.Internal, "service", ActorTypes.Service) => true,
                        _ => false,
                    };
                    if (!ok) context.Fail("Token audience, type and actor do not match.");
                    return Task.CompletedTask;
                },
            };
        });
        return services;
    }

    public static AuthorizationOptions AddGrpcPolicies(this AuthorizationOptions options)
    {
        static bool IsAgent(AuthorizationHandlerContext c) => c.User.HasClaim(ActorTypes.ClaimName, ActorTypes.Agent);
        static bool ServiceWith(AuthorizationHandlerContext c, string scope) =>
            c.User.HasClaim(ActorTypes.ClaimName, ActorTypes.Service) &&
            (c.User.FindFirst("scope")?.Value ?? "").Split(' ').Contains(scope);

        options.AddPolicy(Policies.Agent, p => p.AddAuthenticationSchemes(Scheme).RequireAuthenticatedUser().RequireAssertion(IsAgent));
        options.AddPolicy(Policies.Search, p => p.AddAuthenticationSchemes(Scheme).RequireAuthenticatedUser()
            .RequireAssertion(c => IsAgent(c) || ServiceWith(c, ServiceClient.ScopeSearch)));
        options.AddPolicy(Policies.Revalidate, p => p.AddAuthenticationSchemes(Scheme).RequireAuthenticatedUser()
            .RequireAssertion(c => IsAgent(c) || ServiceWith(c, ServiceClient.ScopeRevalidate)));
        return options;
    }
}
