using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;

namespace Ota.CoreEngine.Controllers;

public sealed record AirportResponse(string Code, string Name, string City, string Country);

public sealed record AirportListResponse(IReadOnlyList<AirportResponse> Items);

/// <summary>
/// Global airport directory search, powering the search panel's From/To typeahead.
/// Airports are shared reference data, not tenant-scoped (see OtaDbContext — Airport
/// has no TenantId / query filter), and the data doesn't move money, so this mirrors
/// the "search" gRPC endpoint's anonymous-allowed precedent rather than requiring a
/// session like AgenciesController/MarkupRulesController do.
/// </summary>
[ApiController]
[Route("api/v1/airports")]
[AllowAnonymous]
public sealed class AirportsController(OtaDbContext db) : ControllerBase
{
    private const int DefaultLimit = 20;
    private const int MaxLimit = 50;

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? query, [FromQuery] int limit = DefaultLimit, CancellationToken ct = default)
    {
        limit = Math.Clamp(limit <= 0 ? DefaultLimit : limit, 1, MaxLimit);

        var term = query?.Trim();
        if (string.IsNullOrEmpty(term))
            return Ok(new AirportListResponse(Array.Empty<AirportResponse>()));

        // Rank exact IATA-code hits first, then IATA-prefix, then name/city
        // substring — so typing "DAC" surfaces Dhaka before any incidental
        // substring match elsewhere in the directory.
        var items = await db.Airports.AsNoTracking()
            .Where(a =>
                EF.Functions.ILike(a.IataCode, term) ||
                EF.Functions.ILike(a.IataCode, $"{term}%") ||
                EF.Functions.ILike(a.Name, $"%{term}%") ||
                EF.Functions.ILike(a.City, $"%{term}%"))
            .OrderBy(a => a.IataCode == term.ToUpper() ? 0 : EF.Functions.ILike(a.IataCode, $"{term}%") ? 1 : 2)
            .ThenBy(a => a.City)
            .Take(limit)
            .Select(a => new AirportResponse(a.IataCode, a.Name, a.City, a.Country))
            .ToListAsync(ct);

        return Ok(new AirportListResponse(items));
    }
}
