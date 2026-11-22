using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.CustomerAuth;

/// <summary>Authentication for endpoints that belong to a signed-in CUSTOMER. A separate scheme from the agent API's: it accepts
/// only audience ota-customers, signed by the customers key, as an access token for a customer. So an agent's token cannot
/// open a customer endpoint, and a customer's token cannot open an agent one.</summary>
public static class CustomerBearer
{
    public const string Scheme = "CustomerBearer";

    public static class Policies
    {
        /// <summary>A signed-in customer acting on their own data.</summary>
        public const string CustomerSelf = "CustomerSelf";
    }

    public static AuthenticationBuilder AddCustomerBearer(this AuthenticationBuilder auth) => auth.AddJwtBearer(Scheme, _ => { });

    public static IServiceCollection ConfigureCustomerBearer(this IServiceCollection services)
    {
        services.AddOptions<JwtBearerOptions>(Scheme).Configure<IConfiguration, IJwtKeyRing>((o, config, keys) =>
        {
            o.MapInboundClaims = false;
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = config["Jwt:Issuer"] ?? "ota-core-engine",
                ValidAudience = TokenAudiences.Customers,
                IssuerSigningKeyResolver = (_, token, kid, _) => JwtKeyRing.Resolve(keys, token, kid),
                ValidAlgorithms = [JwtKeyRing.Algorithm],
                RequireSignedTokens = true,
                ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true, ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromSeconds(30),
            };
            o.Events = new JwtBearerEvents
            {
                // A refresh token must not work as an access token, and only a customer's token belongs here. Then the part that makes sign-out
                // and suspension real: on EVERY request the session is checked — not signed out, not cut off by "sign out everywhere", and the
                // customer still active — so a token is not good for its full 15 minutes if its session is over. Here, in the scheme, so no
                // future customer endpoint can forget to.
                OnTokenValidated = async context =>
                {
                    var p = context.Principal;
                    if (p?.FindFirst("token_type")?.Value != "access" || p.FindFirst(ActorTypes.ClaimName)?.Value != ActorTypes.Customer)
                    {
                        context.Fail("Not a customer access token.");
                        return;
                    }

                    var tenant = p.FindFirst("tenant_id")?.Value;
                    var sid = p.FindFirst("sid")?.Value;
                    if (!Guid.TryParse(p.FindFirst("sub")?.Value, out var customerId) || string.IsNullOrEmpty(tenant) || string.IsNullOrEmpty(sid)
                        || !long.TryParse(p.FindFirst("iat_ms")?.Value, out var issuedAtMs))
                    {
                        context.Fail("The token is missing session claims.");
                        return;
                    }

                    var sessions = context.HttpContext.RequestServices.GetRequiredService<ICustomerSessions>();
                    if (!await sessions.IsValidAsync(tenant, customerId, sid, issuedAtMs, context.HttpContext.RequestAborted))
                        context.Fail("The session has ended.");
                },
            };
        });
        return services;
    }

    public static AuthorizationOptions AddCustomerPolicies(this AuthorizationOptions options)
    {
        options.AddPolicy(Policies.CustomerSelf, p => p.AddAuthenticationSchemes(Scheme).RequireAuthenticatedUser()
            .RequireClaim(ActorTypes.ClaimName, ActorTypes.Customer));
        return options;
    }
}
