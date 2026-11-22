using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Controllers;

// Channel is optional and defaults to agent pricing (B2B_AGENT), so existing clients are unaffected. An agent rule needs a
// Tier; a consumer (B2C) rule must not have one.
public sealed record CreateMarkupRuleRequest(AgentTier? Tier, string ProductType, decimal MarkupPercent, decimal SubAgentDefaultMargin, string? Channel = null);

// Excludes IsActive -- its own activate/deactivate actions below, same
// pattern as UpdateAgencyRequest excluding Agency.IsActive.
// A rule's Channel cannot be changed (that would turn an agent rule into a consumer rule); Channel here, if sent, must match.
public sealed record UpdateMarkupRuleRequest(AgentTier? Tier, string ProductType, decimal MarkupPercent, decimal SubAgentDefaultMargin, string? Channel = null);

public sealed record MarkupRuleResponse(
    Guid Id,
    string Channel,
    string? Tier,
    string ProductType,
    decimal MarkupPercent,
    decimal SubAgentDefaultMargin,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);

public sealed record MarkupRuleListResponse(IReadOnlyList<MarkupRuleResponse> Items, int TotalCount, int Page, int PageSize);

/// <summary>
/// Admin-only CRUD over MarkupRule -- the pricing configuration MarkupResolver
/// reads live on every search/booking. Two pricing schemes: agent rules (keyed by tier)
/// and consumer B2C rules (no tier). Deliberately scoped to
/// MarkupRule's actual existing fields only (Channel, Tier, ProductType, MarkupPercent,
/// SubAgentDefaultMargin, IsActive) -- no AgencyId/SupplierId/currency/effective
/// dates/priority, none of which exist in the model; adding them would be a
/// pricing-engine redesign, out of scope here.
/// </summary>
[ApiController]
[Route("api/v1/markup-rules")]
[Authorize(Policy = RestPolicies.PlatformAdmin)]
public sealed class MarkupRulesController(OtaDbContext db, ITenantAccessor tenantAccessor, ILogger<MarkupRulesController> logger) : ControllerBase
{
    private const int MaxPageSize = 100;

    // MUST match the generated C# enum member names (Ota.cs, ProductType),
    // which protobuf codegen derives by stripping "PRODUCT_TYPE_" and
    // PascalCasing -- NOT the proto's original PRODUCT_TYPE_* wire constants.
    // ResolveMarkupRuleAsync compares against request.ProductType.ToString()
    // at runtime, which produces exactly these strings. Validating against
    // "PRODUCT_TYPE_FLIGHT" etc. would silently accept rules that can never
    // match at resolution time.
    private static readonly HashSet<string> ValidProductTypes =
        new(StringComparer.Ordinal) { "Unspecified", "Flight", "Hotel", "Package", "Activity", "*" };

    [HttpPost]
    public async Task<IActionResult> Create(CreateMarkupRuleRequest request, CancellationToken ct)
    {
        var channel = request.Channel ?? MarkupChannels.B2BAgent;
        var validationError = ValidateMarkupRuleFields(channel, request.Tier, request.ProductType, request.MarkupPercent, request.SubAgentDefaultMargin);
        if (validationError is not null) return validationError;

        if (await db.MarkupRules.AnyAsync(r => r.Channel == channel && r.Tier == request.Tier && r.ProductType == request.ProductType, ct))
            return Conflict(new { error = "markup_rule_exists", message = "A markup rule for this pricing scheme, tier and product type already exists." });

        var rule = new MarkupRule
        {
            TenantId = tenantAccessor.Current!.TenantId,
            Channel = channel,
            Tier = request.Tier,
            ProductType = request.ProductType,
            MarkupPercent = request.MarkupPercent,
            SubAgentDefaultMargin = request.SubAgentDefaultMargin,
        };
        db.MarkupRules.Add(rule);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Admin {AdminUserId} created {Channel} markup rule {RuleId} for tier {Tier}/{ProductType}",
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value, rule.Channel, rule.Id, rule.Tier, rule.ProductType);

        var response = ToResponse(rule);
        return Created($"/api/v1/markup-rules/{rule.Id}", response);
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] AgentTier? tier,
        [FromQuery] string? channel,
        [FromQuery] string? productType,
        [FromQuery] bool? isActive,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.MarkupRules.AsNoTracking().AsQueryable();
        if (tier is not null) query = query.Where(r => r.Tier == tier.Value);
        if (!string.IsNullOrWhiteSpace(channel)) query = query.Where(r => r.Channel == channel);
        if (!string.IsNullOrWhiteSpace(productType)) query = query.Where(r => r.ProductType == productType);
        if (isActive is not null) query = query.Where(r => r.IsActive == isActive.Value);

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderBy(r => r.Channel).ThenBy(r => r.Tier).ThenBy(r => r.ProductType).ThenBy(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new MarkupRuleResponse(r.Id, r.Channel, r.Tier == null ? null : r.Tier.ToString(), r.ProductType, r.MarkupPercent, r.SubAgentDefaultMargin, r.IsActive, r.CreatedAt, r.UpdatedAt))
            .ToListAsync(ct);

        return Ok(new MarkupRuleListResponse(items, totalCount, page, pageSize));
    }

    [HttpGet("{markupRuleId:guid}")]
    public async Task<IActionResult> GetById(Guid markupRuleId, CancellationToken ct)
    {
        var response = await db.MarkupRules.AsNoTracking()
            .Where(r => r.Id == markupRuleId)
            .Select(r => new MarkupRuleResponse(r.Id, r.Channel, r.Tier == null ? null : r.Tier.ToString(), r.ProductType, r.MarkupPercent, r.SubAgentDefaultMargin, r.IsActive, r.CreatedAt, r.UpdatedAt))
            .FirstOrDefaultAsync(ct);

        return response is null ? NotFound(new { error = "markup_rule_not_found" }) : Ok(response);
    }

    [HttpPut("{markupRuleId:guid}")]
    public async Task<IActionResult> Update(Guid markupRuleId, UpdateMarkupRuleRequest request, CancellationToken ct)
    {
        var rule = await db.MarkupRules.FirstOrDefaultAsync(r => r.Id == markupRuleId, ct);
        if (rule is null) return NotFound(new { error = "markup_rule_not_found" });

        if (request.Channel is not null && request.Channel != rule.Channel)
            return BadRequest(new { error = "invalid_request", message = "A markup rule's channel cannot be changed; create a new rule instead." });

        var validationError = ValidateMarkupRuleFields(rule.Channel, request.Tier, request.ProductType, request.MarkupPercent, request.SubAgentDefaultMargin);
        if (validationError is not null) return validationError;

        if (request.Tier != rule.Tier || request.ProductType != rule.ProductType)
        {
            if (await db.MarkupRules.AnyAsync(r => r.Channel == rule.Channel && r.Tier == request.Tier && r.ProductType == request.ProductType && r.Id != markupRuleId, ct))
                return Conflict(new { error = "markup_rule_exists", message = "A markup rule for this pricing scheme, tier and product type already exists." });
        }

        rule.Tier = request.Tier;
        rule.ProductType = request.ProductType;
        rule.MarkupPercent = request.MarkupPercent;
        rule.SubAgentDefaultMargin = request.SubAgentDefaultMargin;
        rule.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);

        logger.LogInformation("Admin {AdminUserId} updated markup rule {RuleId}", User.FindFirst(ClaimTypes.NameIdentifier)?.Value, rule.Id);
        return Ok(ToResponse(rule));
    }

    [HttpPost("{markupRuleId:guid}/activate")]
    public Task<IActionResult> Activate(Guid markupRuleId, CancellationToken ct) => SetActiveState(markupRuleId, isActive: true, ct);

    [HttpPost("{markupRuleId:guid}/deactivate")]
    public Task<IActionResult> Deactivate(Guid markupRuleId, CancellationToken ct) => SetActiveState(markupRuleId, isActive: false, ct);

    private async Task<IActionResult> SetActiveState(Guid markupRuleId, bool isActive, CancellationToken ct)
    {
        var rule = await db.MarkupRules.FirstOrDefaultAsync(r => r.Id == markupRuleId, ct);
        if (rule is null) return NotFound(new { error = "markup_rule_not_found" });

        rule.IsActive = isActive;
        rule.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Admin {AdminUserId} {Action} markup rule {RuleId}",
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value, isActive ? "activated" : "deactivated", rule.Id);
        return Ok(ToResponse(rule));
    }

    private IActionResult? ValidateMarkupRuleFields(string channel, AgentTier? tier, string productType, decimal markupPercent, decimal subAgentDefaultMargin)
    {
        if (channel is not (MarkupChannels.B2BAgent or MarkupChannels.B2C))
            return BadRequest(new { error = "invalid_request", message = "Channel must be B2B_AGENT or B2C." });
        if (channel == MarkupChannels.B2BAgent && (tier is null || !Enum.IsDefined(tier.Value)))
            return BadRequest(new { error = "invalid_request", message = "A valid tier is required." });
        if (channel == MarkupChannels.B2C && tier is not null)
            return BadRequest(new { error = "invalid_request", message = "A B2C rule has no tier." });
        if (!ValidProductTypes.Contains(productType))
            return BadRequest(new { error = "invalid_request", message = "ProductType must be one of: Unspecified, Flight, Hotel, Package, Activity, or \"*\"." });
        if (markupPercent is < 0 or > 1)
            return BadRequest(new { error = "invalid_request", message = "Markup percent must be within [0, 1]." });
        if (subAgentDefaultMargin < 0)
            return BadRequest(new { error = "invalid_request", message = "Sub-agent default margin cannot be negative." });
        return null;
    }

    private static MarkupRuleResponse ToResponse(MarkupRule r) =>
        new(r.Id, r.Channel, r.Tier?.ToString(), r.ProductType, r.MarkupPercent, r.SubAgentDefaultMargin, r.IsActive, r.CreatedAt, r.UpdatedAt);
}
