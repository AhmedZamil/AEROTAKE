using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Controllers;

public sealed record CreateAgencyRequest(string DisplayName, string Email, AgentTier Tier, decimal CreditLimit = 0m);

// Deliberately excludes CreditLimit (credit changes are a separate, C3
// endpoint), IsActive (its own activate/deactivate actions below), and
// ParentAgentId (sub-agent hierarchy management is a separate task). This is
// also enforced structurally, not just by omission: System.Text.Json ignores
// unknown request-body properties by default, so a client can't smuggle any
// of those fields through even by sending them.
public sealed record UpdateAgencyRequest(string DisplayName, string Email, AgentTier Tier);

public sealed record AgencyResponse(
    Guid Id,
    string DisplayName,
    string Email,
    string Tier,
    decimal CreditLimit,
    decimal CreditUsed,
    decimal AvailableCredit,
    bool IsActive,
    Guid? ParentAgentId,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);

public sealed record AgencyListResponse(IReadOnlyList<AgencyResponse> Items, int TotalCount, int Page, int PageSize);

/// <summary>
/// Admin-only agency management (create/list/get/update/activate/deactivate).
/// Distinct from AgentsController, which is the self-service surface an
/// agency's own users call for their own credit/ledger — this controller is
/// platform-staff tooling for administering agencies, so it is scoped to the
/// Admin role only; AgencyAdmin/AgencyUser never reach it. Cross-tenant access
/// is already impossible via OtaDbContext's global query filter, so there is
/// no additional per-row ownership check to write here.
/// </summary>
[ApiController]
[Route("api/v1/agencies")]
[Authorize(Policy = RestPolicies.PlatformAdmin)]
public sealed class AgenciesController(OtaDbContext db, ITenantAccessor tenantAccessor, ILogger<AgenciesController> logger) : ControllerBase
{
    private const int MaxPageSize = 100;

    [HttpPost]
    public async Task<IActionResult> Create(CreateAgencyRequest request, CancellationToken ct)
    {
        var validationError = ValidateAgencyFields(request.DisplayName, request.Email, request.Tier);
        if (validationError is not null) return validationError;
        if (request.CreditLimit < 0)
            return BadRequest(new { error = "invalid_request", message = "Credit limit cannot be negative." });

        var tierError = await ValidateTierIsAssignable(request.Tier, ct);
        if (tierError is not null) return tierError;

        var displayName = request.DisplayName.Trim();
        var email = request.Email.Trim();

        if (await db.Agents.AnyAsync(a => a.Email == email, ct))
            return Conflict(new { error = "email_taken", message = "An agency with this email already exists." });

        var agent = new Agent
        {
            // Authenticated route: the tenant comes from the validated JWT via
            // TenantResolutionMiddleware, not a client-supplied header (that
            // header path is only trusted for [AllowAnonymous] endpoints).
            TenantId = tenantAccessor.Current!.TenantId,
            DisplayName = displayName,
            Email = email,
            Tier = request.Tier,
            CreditLimit = request.CreditLimit,
        };
        db.Agents.Add(agent);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Admin {AdminUserId} created agency {AgentId} ({DisplayName})",
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value, agent.Id, agent.DisplayName);

        var response = ToResponse(agent);
        return Created($"/api/v1/agencies/{agent.Id}", response);
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] bool? isActive,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.Agents.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(a => EF.Functions.ILike(a.DisplayName, $"%{term}%") || EF.Functions.ILike(a.Email, $"%{term}%"));
        }
        if (isActive is not null)
            query = query.Where(a => a.IsActive == isActive.Value);

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderBy(a => a.DisplayName).ThenBy(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AgencyResponse(
                a.Id, a.DisplayName, a.Email, a.Tier.ToString(),
                a.CreditLimit, a.CreditUsed, a.CreditLimit - a.CreditUsed,
                a.IsActive, a.ParentAgentId, a.CreatedAt, a.UpdatedAt))
            .ToListAsync(ct);

        return Ok(new AgencyListResponse(items, totalCount, page, pageSize));
    }

    [HttpGet("{agencyId:guid}")]
    public async Task<IActionResult> GetById(Guid agencyId, CancellationToken ct)
    {
        var response = await db.Agents.AsNoTracking()
            .Where(a => a.Id == agencyId)
            .Select(a => new AgencyResponse(
                a.Id, a.DisplayName, a.Email, a.Tier.ToString(),
                a.CreditLimit, a.CreditUsed, a.CreditLimit - a.CreditUsed,
                a.IsActive, a.ParentAgentId, a.CreatedAt, a.UpdatedAt))
            .FirstOrDefaultAsync(ct);

        return response is null ? NotFound(new { error = "agency_not_found" }) : Ok(response);
    }

    [HttpPut("{agencyId:guid}")]
    public async Task<IActionResult> Update(Guid agencyId, UpdateAgencyRequest request, CancellationToken ct)
    {
        var agent = await db.Agents.FirstOrDefaultAsync(a => a.Id == agencyId, ct);
        if (agent is null) return NotFound(new { error = "agency_not_found" });

        var validationError = ValidateAgencyFields(request.DisplayName, request.Email, request.Tier);
        if (validationError is not null) return validationError;

        // Only re-check tier assignability when the tier is actually changing —
        // otherwise an agency already sitting on a tier that's since been
        // deactivated would become permanently un-editable for even unrelated
        // field changes, which isn't the intent (the rule is about *choosing*
        // a disabled tier, not *already having* one).
        if (request.Tier != agent.Tier)
        {
            var tierError = await ValidateTierIsAssignable(request.Tier, ct);
            if (tierError is not null) return tierError;
        }

        var displayName = request.DisplayName.Trim();
        var email = request.Email.Trim();

        if (await db.Agents.AnyAsync(a => a.Email == email && a.Id != agencyId, ct))
            return Conflict(new { error = "email_taken", message = "An agency with this email already exists." });

        agent.DisplayName = displayName;
        agent.Email = email;
        agent.Tier = request.Tier;
        agent.UpdatedAt = DateTimeOffset.UtcNow;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { error = "concurrent_update", message = "This agency was modified by another process. Please retry." });
        }

        logger.LogInformation("Admin {AdminUserId} updated agency {AgentId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value, agent.Id);
        return Ok(ToResponse(agent));
    }

    [HttpPost("{agencyId:guid}/activate")]
    public Task<IActionResult> Activate(Guid agencyId, CancellationToken ct) => SetActiveState(agencyId, isActive: true, ct);

    [HttpPost("{agencyId:guid}/deactivate")]
    public Task<IActionResult> Deactivate(Guid agencyId, CancellationToken ct) => SetActiveState(agencyId, isActive: false, ct);

    private async Task<IActionResult> SetActiveState(Guid agencyId, bool isActive, CancellationToken ct)
    {
        var agent = await db.Agents.FirstOrDefaultAsync(a => a.Id == agencyId, ct);
        if (agent is null) return NotFound(new { error = "agency_not_found" });

        agent.IsActive = isActive;
        agent.UpdatedAt = DateTimeOffset.UtcNow;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { error = "concurrent_update", message = "This agency was modified by another process. Please retry." });
        }

        logger.LogInformation("Admin {AdminUserId} {Action} agency {AgentId}",
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value, isActive ? "activated" : "deactivated", agent.Id);
        return Ok(ToResponse(agent));
    }

    // Tier binds from the raw numeric JSON value (no JsonStringEnumConverter is
    // registered), so an omitted or out-of-range value silently binds to 0,
    // which is not a valid AgentTier member — Enum.IsDefined catches that.
    private IActionResult? ValidateAgencyFields(string displayName, string email, AgentTier tier)
    {
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Trim().Length > 200)
            return BadRequest(new { error = "invalid_request", message = "Display name is required and must be 200 characters or fewer." });
        if (string.IsNullOrWhiteSpace(email) || email.Trim().Length > 320)
            return BadRequest(new { error = "invalid_request", message = "Email is required and must be 320 characters or fewer." });
        if (!Enum.IsDefined(tier))
            return BadRequest(new { error = "invalid_request", message = "A valid tier is required." });
        return null;
    }

    // null => no AgentTierProfile configured for this tenant/tier at all =>
    // never block (profiles are optional, opt-in metadata; tenants who never
    // touch that feature must keep working exactly as before).
    private async Task<IActionResult?> ValidateTierIsAssignable(AgentTier tier, CancellationToken ct)
    {
        var tierIsActive = await db.AgentTierProfiles.AsNoTracking()
            .Where(p => p.Tier == tier)
            .Select(p => (bool?)p.IsActive)
            .FirstOrDefaultAsync(ct);
        if (tierIsActive == false)
            return BadRequest(new { error = "tier_inactive", message = $"Tier '{tier}' is currently disabled for this tenant and cannot be assigned." });
        return null;
    }

    private static AgencyResponse ToResponse(Agent a) => new(
        a.Id, a.DisplayName, a.Email, a.Tier.ToString(),
        a.CreditLimit, a.CreditUsed, a.CreditLimit - a.CreditUsed,
        a.IsActive, a.ParentAgentId, a.CreatedAt, a.UpdatedAt);
}
