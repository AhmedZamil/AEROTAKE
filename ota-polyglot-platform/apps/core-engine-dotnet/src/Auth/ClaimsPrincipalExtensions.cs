using System.Security.Claims;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Auth;

/// <summary>
/// Reads the role/agent identity claims JwtTokenService stamps onto every
/// access token (see BuildToken). agent_id/tenant_id are plain short claim
/// names and stay that way through validation (FindFirst("agent_id") works,
/// matching TenantResolutionMiddleware's own FindFirst("tenant_id")). "role"
/// is different: the JwtBearer pipeline's inbound claim-type mapping rewrites
/// it to ClaimTypes.Role before it reaches ClaimsPrincipal (verified via a
/// claims dump — see Program.cs's matching comment on RoleClaimType), so it
/// must be looked up there, not by the raw "role" name.
/// </summary>
public static class ClaimsPrincipalExtensions
{
    public static UserRole? GetRole(this ClaimsPrincipal user) =>
        Enum.TryParse<UserRole>(user.FindFirst(ClaimTypes.Role)?.Value, out var role) ? role : null;

    public static Guid? GetAgentId(this ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirst("agent_id")?.Value, out var id) ? id : null;

    /// <summary>Platform Admins can access any agent's data within the tenant;
    /// AgencyAdmin/AgencyUser are scoped to their own agent only.</summary>
    public static bool CanAccessAgent(this ClaimsPrincipal user, Guid agentId) =>
        user.GetRole() == UserRole.Admin || user.GetAgentId() == agentId;

    /// <summary>Same rule as <see cref="CanAccessAgent"/>, applied to a booking's
    /// owning agent and (if present) sub-agent.</summary>
    public static bool CanAccessBooking(this ClaimsPrincipal user, Guid? bookingAgentId, Guid? bookingSubAgentId)
    {
        if (user.GetRole() == UserRole.Admin) return true;
        var myAgentId = user.GetAgentId();
        return myAgentId is not null && (bookingAgentId == myAgentId || bookingSubAgentId == myAgentId);
    }
}
