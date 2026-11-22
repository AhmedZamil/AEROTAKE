using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;

namespace Ota.CoreEngine.Controllers;

/// <summary>
/// REST surface for B2B portal screens. All queries are automatically
/// tenant-scoped by the EF global filter (see OtaDbContext) — that only
/// stops cross-tenant access. Within a tenant, every action here also scopes
/// to the caller's own agent (Admin excepted) so one agency can't read
/// another's credit/ledger/bookings just by guessing an id.
/// </summary>
[ApiController]
[Route("api/v1/agents")]
[Authorize(Policy = RestPolicies.AgentOnly)]
public sealed class AgentsController(OtaDbContext db) : ControllerBase
{
    [HttpGet("{agentId:guid}/credit")]
    public async Task<IActionResult> GetCredit(Guid agentId, CancellationToken ct)
    {
        // Not the caller's own agent: respond identically to "doesn't exist"
        // rather than 403, so a valid agentId can't be distinguished from an
        // invalid one by an unauthorized caller.
        if (!User.CanAccessAgent(agentId)) return NotFound(new { error = "agent_not_found" });

        var agent = await db.Agents
            .Where(a => a.Id == agentId)
            .Select(a => new
            {
                a.Id,
                a.DisplayName,
                Tier = a.Tier.ToString(),
                a.CreditLimit,
                a.CreditUsed,
                Available = a.CreditLimit - a.CreditUsed
            })
            .FirstOrDefaultAsync(ct);

        return agent is null ? NotFound(new { error = "agent_not_found" }) : Ok(agent);
    }

    [HttpGet("{agentId:guid}/ledger")]
    public async Task<IActionResult> GetLedger(Guid agentId, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        if (!User.CanAccessAgent(agentId)) return NotFound(new { error = "agent_not_found" });

        var agentExists = await db.Agents.AnyAsync(a => a.Id == agentId, ct);
        if (!agentExists) return NotFound(new { error = "agent_not_found" });

        take = Math.Clamp(take, 1, 200);
        var entries = await db.LedgerEntries
            .Where(l => l.AgentId == agentId)
            .OrderByDescending(l => l.CreatedAt)
            .Take(take)
            .Select(l => new { l.Id, Type = l.Type.ToString(), l.Amount, l.BalanceAfter, l.Reference, l.CreatedAt })
            .ToListAsync(ct);

        return Ok(entries);
    }

    /// <summary>Recent bookings for the dashboard-home widget — same
    /// ownership/clamp/order pattern as GetLedger above. Scoped to AgentId
    /// only, not rolled up across sub-agents, for consistency with how
    /// GetCredit/GetLedger already treat "this agent's own records."</summary>
    [HttpGet("{agentId:guid}/bookings")]
    public async Task<IActionResult> GetBookings(Guid agentId, [FromQuery] int take = 10, CancellationToken ct = default)
    {
        if (!User.CanAccessAgent(agentId)) return NotFound(new { error = "agent_not_found" });

        var agentExists = await db.Agents.AnyAsync(a => a.Id == agentId, ct);
        if (!agentExists) return NotFound(new { error = "agent_not_found" });

        take = Math.Clamp(take, 1, 50);
        var bookings = await db.Bookings
            .Where(b => b.AgentId == agentId)
            .OrderByDescending(b => b.CreatedAt)
            .Take(take)
            .Select(b => new
            {
                b.Id, b.Pnr, Status = b.Status.ToString(), b.SupplierCode,
                b.FinalPrice, b.Currency, b.CreatedAt, b.TicketingDeadline, b.TravelersJson
            })
            .ToListAsync(ct);

        return Ok(bookings.Select(b => new
        {
            b.Id, b.Pnr, b.Status, b.SupplierCode, b.FinalPrice, b.Currency, b.CreatedAt,
            b.TicketingDeadline,
            PrimaryTraveler = ExtractPrimaryTravelerName(b.TravelersJson),
        }));
    }

    /// <summary>TravelersJson is serialized with default (PascalCase) field
    /// names — see OtaCoreGrpcService.ProcessB2BBooking's Serialize call,
    /// which passes no JsonSerializerOptions. Never throws: a malformed or
    /// empty entry just means no display name, not a broken response.</summary>
    private static string? ExtractPrimaryTravelerName(string travelersJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(travelersJson);
            var travelers = doc.RootElement.EnumerateArray();
            if (!travelers.MoveNext()) return null;

            var first = travelers.Current;
            var firstName = first.TryGetProperty("FirstName", out var fn) ? fn.GetString() : null;
            var lastName = first.TryGetProperty("LastName", out var ln) ? ln.GetString() : null;
            var full = $"{firstName} {lastName}".Trim();
            return string.IsNullOrWhiteSpace(full) ? null : full;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

[ApiController]
[Route("api/v1/bookings")]
[Authorize(Policy = RestPolicies.AgentOnly)]
public sealed class BookingsController(OtaDbContext db) : ControllerBase
{
    [HttpGet("{pnr}")]
    public async Task<IActionResult> GetByPnr(string pnr, CancellationToken ct)
    {
        var booking = await db.Bookings
            .Where(b => b.Pnr == pnr.ToUpperInvariant())
            .Select(b => new
            {
                b.Id, b.Pnr, Status = b.Status.ToString(),
                b.SupplierCode, b.FinalPrice, b.Currency, b.CreatedAt,
                b.AgentId, b.SubAgentId
            })
            .FirstOrDefaultAsync(ct);

        if (booking is null) return NotFound(new { error = "booking_not_found" });
        if (!User.CanAccessBooking(booking.AgentId, booking.SubAgentId))
            return NotFound(new { error = "booking_not_found" });

        return Ok(new
        {
            booking.Id, booking.Pnr, booking.Status,
            booking.SupplierCode, booking.FinalPrice, booking.Currency, booking.CreatedAt
        });
    }
}
