using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Controllers;

public sealed record CreateExchangeRateRequest(
    string FromCurrency,
    string ToCurrency,
    decimal Rate,
    DateTimeOffset? EffectiveFrom = null,
    DateTimeOffset? EffectiveTo = null,
    string? Source = null);

/// <summary>Pair and EffectiveFrom are immutable; change those by creating a new rate.</summary>
public sealed record UpdateExchangeRateRequest(decimal? Rate = null, DateTimeOffset? EffectiveTo = null);

public sealed record ExchangeRateResponse(
    Guid Id,
    string FromCurrency,
    string ToCurrency,
    decimal Rate,
    DateTimeOffset EffectiveFrom,
    DateTimeOffset? EffectiveTo,
    string Source);

public sealed record ExchangeRateListResponse(IReadOnlyList<ExchangeRateResponse> Items);

/// <summary>
/// PlatformAdmin CRUD over global <see cref="ExchangeRate"/> rows that
/// <see cref="Pricing.CurrencyConversion"/> reads on every search/booking.
/// Not tenant-scoped (same as airports) — one rate table for the whole platform.
/// </summary>
[ApiController]
[Route("api/v1/exchange-rates")]
[Authorize(Policy = RestPolicies.PlatformAdmin)]
public sealed class ExchangeRatesController(OtaDbContext db, ILogger<ExchangeRatesController> logger) : ControllerBase
{
    private static readonly Regex Iso4217 = new("^[A-Z]{3}$", RegexOptions.Compiled);

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] DateTimeOffset? asOf,
        CancellationToken ct)
    {
        var at = asOf ?? DateTimeOffset.UtcNow;
        var query = db.ExchangeRates.AsNoTracking()
            .Where(r => r.EffectiveFrom <= at && (r.EffectiveTo == null || r.EffectiveTo > at));

        if (NormalizeCurrency(from) is { } fromCode)
            query = query.Where(r => r.FromCurrency == fromCode);
        if (NormalizeCurrency(to) is { } toCode)
            query = query.Where(r => r.ToCurrency == toCode);

        var items = await query
            .OrderBy(r => r.FromCurrency).ThenBy(r => r.ToCurrency).ThenByDescending(r => r.EffectiveFrom)
            .Select(r => new ExchangeRateResponse(r.Id, r.FromCurrency, r.ToCurrency, r.Rate, r.EffectiveFrom, r.EffectiveTo, r.Source))
            .ToListAsync(ct);

        return Ok(new ExchangeRateListResponse(items));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var row = await db.ExchangeRates.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, ct);
        return row is null ? NotFound(new { error = "exchange_rate_not_found" }) : Ok(ToResponse(row));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateExchangeRateRequest request, CancellationToken ct)
    {
        var from = NormalizeCurrency(request.FromCurrency);
        var to = NormalizeCurrency(request.ToCurrency);
        if (from is null || to is null)
            return BadRequest(new { error = "invalid_request", message = "FromCurrency and ToCurrency must be 3-letter ISO 4217 codes." });
        if (from == to)
            return BadRequest(new { error = "invalid_request", message = "FromCurrency and ToCurrency must differ." });
        if (request.Rate <= 0)
            return BadRequest(new { error = "invalid_request", message = "Rate must be greater than zero." });

        var effectiveFrom = request.EffectiveFrom ?? DateTimeOffset.UtcNow;
        if (request.EffectiveTo is { } effectiveTo && effectiveTo <= effectiveFrom)
            return BadRequest(new { error = "invalid_request", message = "EffectiveTo must be after EffectiveFrom." });

        if (await db.ExchangeRates.AnyAsync(r =>
                r.FromCurrency == from && r.ToCurrency == to && r.EffectiveFrom == effectiveFrom, ct))
            return Conflict(new { error = "exchange_rate_exists", message = "A rate for this pair and EffectiveFrom already exists." });

        // Close any still-open row for the same pair so history stays a single open window.
        if (request.EffectiveTo is null)
        {
            var open = await db.ExchangeRates
                .Where(r => r.FromCurrency == from && r.ToCurrency == to && r.EffectiveTo == null)
                .ToListAsync(ct);
            foreach (var prior in open)
            {
                if (prior.EffectiveFrom >= effectiveFrom)
                    return Conflict(new { error = "exchange_rate_overlap", message = "An open rate already starts at or after this EffectiveFrom; close or adjust it first." });
                prior.EffectiveTo = effectiveFrom;
            }
        }

        var row = new ExchangeRate
        {
            FromCurrency = from,
            ToCurrency = to,
            Rate = request.Rate,
            EffectiveFrom = effectiveFrom,
            EffectiveTo = request.EffectiveTo,
            Source = string.IsNullOrWhiteSpace(request.Source) ? "manual" : request.Source.Trim(),
        };
        db.ExchangeRates.Add(row);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Admin {AdminUserId} created exchange rate {RateId} {From}->{To}={Rate}",
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value, row.Id, row.FromCurrency, row.ToCurrency, row.Rate);

        return Created($"/api/v1/exchange-rates/{row.Id}", ToResponse(row));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateExchangeRateRequest request, CancellationToken ct)
    {
        var row = await db.ExchangeRates.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (row is null) return NotFound(new { error = "exchange_rate_not_found" });

        if (request.Rate is { } rate)
        {
            if (rate <= 0)
                return BadRequest(new { error = "invalid_request", message = "Rate must be greater than zero." });
            row.Rate = rate;
        }

        if (request.EffectiveTo is { } effectiveTo)
        {
            if (effectiveTo <= row.EffectiveFrom)
                return BadRequest(new { error = "invalid_request", message = "EffectiveTo must be after EffectiveFrom." });
            row.EffectiveTo = effectiveTo;
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Admin {AdminUserId} updated exchange rate {RateId}",
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value, row.Id);
        return Ok(ToResponse(row));
    }

    /// <summary>Soft-close: set EffectiveTo = UtcNow if still open. Keeps audit history.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftClose(Guid id, CancellationToken ct)
    {
        var row = await db.ExchangeRates.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (row is null) return NotFound(new { error = "exchange_rate_not_found" });

        if (row.EffectiveTo is null || row.EffectiveTo > DateTimeOffset.UtcNow)
            row.EffectiveTo = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Admin {AdminUserId} soft-closed exchange rate {RateId}",
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value, row.Id);
        return NoContent();
    }

    private static string? NormalizeCurrency(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var normalized = code.Trim().ToUpperInvariant();
        return Iso4217.IsMatch(normalized) ? normalized : null;
    }

    private static ExchangeRateResponse ToResponse(ExchangeRate r) =>
        new(r.Id, r.FromCurrency, r.ToCurrency, r.Rate, r.EffectiveFrom, r.EffectiveTo, r.Source);
}
