using Microsoft.AspNetCore.Authorization;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Auth;

/// <summary>Who may call the agent-side REST API, defined once. Every REST endpoint must declare one of these (or [AllowAnonymous], or the
/// customer policy) — and an endpoint that declares nothing is refused, not served: see <see cref="AddRestPolicies"/>.
///
/// All of them are built on the default (agent) authentication scheme, so a customer token — a different audience, signed by a different
/// key — can never satisfy them; on top of that they check the ACTOR is an agent, not merely that a token is present.</summary>
public static class RestPolicies
{
    /// <summary>Any signed-in agent user: an agency's staff or a platform admin.</summary>
    public const string AgentOnly = "AgentOnly";

    /// <summary>An agency administrator or a platform admin.</summary>
    public const string AgentAdmin = "AgentAdmin";

    /// <summary>A platform administrator (the Admin role): tenant-wide configuration and every agency's data.</summary>
    public const string PlatformAdmin = "PlatformAdmin";

    public static AuthorizationOptions AddRestPolicies(this AuthorizationOptions options)
    {
        options.AddPolicy(AgentOnly, p => p.RequireAuthenticatedUser()
            .RequireClaim(ActorTypes.ClaimName, ActorTypes.Agent)
            .RequireRole(nameof(UserRole.Admin), nameof(UserRole.AgencyAdmin), nameof(UserRole.AgencyUser)));
        options.AddPolicy(AgentAdmin, p => p.RequireAuthenticatedUser()
            .RequireClaim(ActorTypes.ClaimName, ActorTypes.Agent)
            .RequireRole(nameof(UserRole.Admin), nameof(UserRole.AgencyAdmin)));
        options.AddPolicy(PlatformAdmin, p => p.RequireAuthenticatedUser()
            .RequireClaim(ActorTypes.ClaimName, ActorTypes.Agent)
            .RequireRole(nameof(UserRole.Admin)));

        // DEFAULT DENY. An endpoint with no [Authorize] and no [AllowAnonymous] used to be open to the world; now it requires a signed-in
        // agent. Forgetting to declare access fails safe. (The audit test additionally fails the build, so the omission is caught, not just contained.)
        options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
        return options;
    }
}
