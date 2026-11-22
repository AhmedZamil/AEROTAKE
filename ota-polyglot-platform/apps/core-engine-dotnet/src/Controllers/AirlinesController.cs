using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;

namespace Ota.CoreEngine.Controllers;

public sealed record AirlineResponse(string Code, string Name, string? LogoUrl);

public sealed record AirlineListResponse(IReadOnlyList<AirlineResponse> Items);

/// <summary>
/// Global airline directory, powering the search panel's "Preferred Airline"
/// filter. Unlike AirportsController this isn't a typeahead — it's a plain
/// dropdown, so it just returns the whole directory (~1,150 airlines) sorted by
/// name rather than requiring a search term. Same anonymous-allowed, non-tenant
/// reasoning as AirportsController.
/// </summary>
[ApiController]
[Route("api/v1/airlines")]
[AllowAnonymous]
public sealed class AirlinesController(OtaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var items = await db.Airlines.AsNoTracking()
            .OrderBy(a => a.Name)
            .Select(a => new AirlineResponse(a.IataCode, a.Name, a.LogoUrl))
            .ToListAsync(ct);

        return Ok(new AirlineListResponse(items));
    }
}
