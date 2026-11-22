using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Controllers;

public sealed record CreateAgentTierProfileRequest(AgentTier Tier, string Name, string? Description, bool IsDefault = false);

// No IsDefault "add-only" restriction here: an admin may freely promote/demote
// the default flag through Update, same as any other field.
public sealed record UpdateAgentTierProfileRequest(string Name, string? Description, bool IsDefault, bool IsActive);

public sealed record AgentTierProfileResponse(
    Guid Id,
    string Tier,
    string Name,
    string? Description,
    bool IsDefault,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);

// Deliberately no TotalCount/Page/PageSize: the (TenantId, Tier) unique index
// caps this resource at exactly 4 rows per tenant, ever -- pagination would be
// pure overhead here, unlike AgenciesController's AgencyListResponse.
public sealed record AgentTierProfileListResponse(IReadOnlyList<AgentTierProfileResponse> Items);

/// <summary>
/// Admin-only metadata (name/description/default/active) layered over the 4
/// fixed AgentTier enum slots, per tenant. This does NOT make tiers dynamic —
/// see the class doc on AgentTierProfile in Domain/Entities.cs. Same
/// authorization scope as AgenciesController: platform-admin configuration,
/// not agency self-service.
/// </summary>
[ApiController]
[Route("api/v1/agent-tiers")]
[Authorize(Policy = RestPolicies.PlatformAdmin)]
public sealed class AgentTierProfilesController(OtaDbContext db, ITenantAccessor tenantAccessor, ILogger<AgentTierProfilesController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(CreateAgentTierProfileRequest request, CancellationToken ct)
    {
        if (!Enum.IsDefined(request.Tier))
            return BadRequest(new { error = "invalid_request", message = "A valid tier is required." });
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 200)
            return BadRequest(new { error = "invalid_request", message = "Name is required and must be 200 characters or fewer." });
        if (request.Description is { Length: > 1000 })
            return BadRequest(new { error = "invalid_request", message = "Description must be 1000 characters or fewer." });

        if (await db.AgentTierProfiles.AnyAsync(p => p.Tier == request.Tier, ct))
            return Conflict(new { error = "tier_profile_exists", message = "A profile for this tier already exists for your tenant." });

        var profile = new AgentTierProfile
        {
            TenantId = tenantAccessor.Current!.TenantId,
            Tier = request.Tier,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
        };

        if (request.IsDefault)
            await UnsetExistingDefaultAsync(excludeId: null, ct);
        profile.IsDefault = request.IsDefault;

        db.AgentTierProfiles.Add(profile);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Admin {AdminUserId} created agent tier profile {ProfileId} for tier {Tier}",
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value, profile.Id, profile.Tier);

        var response = ToResponse(profile);
        return Created($"/api/v1/agent-tiers/{profile.Id}", response);
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var items = await db.AgentTierProfiles.AsNoTracking()
            .OrderBy(p => p.Tier)
            .Select(p => new AgentTierProfileResponse(p.Id, p.Tier.ToString(), p.Name, p.Description, p.IsDefault, p.IsActive, p.CreatedAt, p.UpdatedAt))
            .ToListAsync(ct);

        return Ok(new AgentTierProfileListResponse(items));
    }

    [HttpGet("{agentTierProfileId:guid}")]
    public async Task<IActionResult> GetById(Guid agentTierProfileId, CancellationToken ct)
    {
        var response = await db.AgentTierProfiles.AsNoTracking()
            .Where(p => p.Id == agentTierProfileId)
            .Select(p => new AgentTierProfileResponse(p.Id, p.Tier.ToString(), p.Name, p.Description, p.IsDefault, p.IsActive, p.CreatedAt, p.UpdatedAt))
            .FirstOrDefaultAsync(ct);

        return response is null ? NotFound(new { error = "agent_tier_profile_not_found" }) : Ok(response);
    }

    [HttpPut("{agentTierProfileId:guid}")]
    public async Task<IActionResult> Update(Guid agentTierProfileId, UpdateAgentTierProfileRequest request, CancellationToken ct)
    {
        var profile = await db.AgentTierProfiles.FirstOrDefaultAsync(p => p.Id == agentTierProfileId, ct);
        if (profile is null) return NotFound(new { error = "agent_tier_profile_not_found" });

        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 200)
            return BadRequest(new { error = "invalid_request", message = "Name is required and must be 200 characters or fewer." });
        if (request.Description is { Length: > 1000 })
            return BadRequest(new { error = "invalid_request", message = "Description must be 1000 characters or fewer." });

        if (request.IsDefault && !profile.IsDefault)
            await UnsetExistingDefaultAsync(excludeId: profile.Id, ct);

        profile.Name = request.Name.Trim();
        profile.Description = request.Description?.Trim();
        profile.IsDefault = request.IsDefault;
        profile.IsActive = request.IsActive;
        profile.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        logger.LogInformation("Admin {AdminUserId} updated agent tier profile {ProfileId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value, profile.Id);
        return Ok(ToResponse(profile));
    }

    // Commits the unset as its own SaveChangesAsync, separate from whatever
    // sets the new default afterward. The partial unique index on (TenantId)
    // WHERE IsDefault is a Postgres INDEX, not a UNIQUE CONSTRAINT, so it can't
    // be made DEFERRABLE — if both flips landed in one SaveChangesAsync, EF's
    // statement order isn't guaranteed and a transient two-defaults state can
    // hit the constraint before the batch finishes.
    private async Task UnsetExistingDefaultAsync(Guid? excludeId, CancellationToken ct)
    {
        var current = await db.AgentTierProfiles.FirstOrDefaultAsync(p => p.IsDefault && p.Id != excludeId, ct);
        if (current is not null)
        {
            current.IsDefault = false;
            await db.SaveChangesAsync(ct);
        }
    }

    private static AgentTierProfileResponse ToResponse(AgentTierProfile p) =>
        new(p.Id, p.Tier.ToString(), p.Name, p.Description, p.IsDefault, p.IsActive, p.CreatedAt, p.UpdatedAt);
}
