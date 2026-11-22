using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Pricing;

/// <summary>P4-10: supplier amounts → tenant <see cref="Tenant.SellCurrency"/> using <see cref="ExchangeRate"/>.
/// The request's currency label is never consulted — only the tenant registry and the rate table.</summary>
public interface ICurrencyConversion
{
    /// <summary>ISO 4217 sell currency for this tenant. Tenants without a registry row fall back to USD
    /// (legacy agent-only tenants created before the registry).</summary>
    Task<string> SellCurrencyAsync(string tenantId, CancellationToken ct);

    /// <summary>Convert <paramref name="amount"/> from one ISO currency to another.
    /// Same currency is a no-op. Result is rounded half-away-from-zero to 2 decimal places.
    /// Missing rate → <see cref="ServiceException"/> (<see cref="ErrorKind.FailedPrecondition"/>).</summary>
    Task<decimal> ConvertAsync(decimal amount, string fromCurrency, string toCurrency, CancellationToken ct);

    /// <summary>Convert supplier net + tax into the tenant's sell currency for quoting.</summary>
    Task<(decimal Net, decimal Tax, string Currency)> ToSellCurrencyAsync(
        string tenantId, decimal net, decimal tax, string supplierCurrency, CancellationToken ct);
}

public sealed class CurrencyConversion(OtaDbContext db, ILogger<CurrencyConversion> logger) : ICurrencyConversion
{
    /// <summary>Loaded once per scope: (from,to) → rate. Latest EffectiveFrom among current rows wins.</summary>
    private Dictionary<(string From, string To), decimal>? _rates;

    public async Task<string> SellCurrencyAsync(string tenantId, CancellationToken ct)
    {
        var sell = await db.Tenants.AsNoTracking()
            .Where(t => t.TenantId == tenantId)
            .Select(t => t.SellCurrency)
            .FirstOrDefaultAsync(ct);
        return Normalize(sell) ?? "USD";
    }

    public async Task<(decimal Net, decimal Tax, string Currency)> ToSellCurrencyAsync(
        string tenantId, decimal net, decimal tax, string supplierCurrency, CancellationToken ct)
    {
        var sell = await SellCurrencyAsync(tenantId, ct);
        var from = Normalize(supplierCurrency) ?? "USD";
        return (await ConvertAsync(net, from, sell, ct), await ConvertAsync(tax, from, sell, ct), sell);
    }

    public async Task<decimal> ConvertAsync(decimal amount, string fromCurrency, string toCurrency, CancellationToken ct)
    {
        var from = Normalize(fromCurrency) ?? throw new ArgumentException("from currency is required.", nameof(fromCurrency));
        var to = Normalize(toCurrency) ?? throw new ArgumentException("to currency is required.", nameof(toCurrency));
        if (from == to) return Round(amount);

        await EnsureRatesAsync(ct);
        if (_rates!.TryGetValue((from, to), out var rate))
            return Round(amount * rate);

        logger.LogError("No FX rate for {From}->{To}; refusing to quote in the wrong currency", from, to);
        throw new ServiceException(ErrorKind.FailedPrecondition,
            $"No exchange rate is configured for {from} → {to}. Prices cannot be shown until ops adds one.");
    }

    private async Task EnsureRatesAsync(CancellationToken ct)
    {
        if (_rates is not null) return;
        var now = DateTimeOffset.UtcNow;
        var rows = await db.ExchangeRates.AsNoTracking()
            .Where(r => r.EffectiveFrom <= now && (r.EffectiveTo == null || r.EffectiveTo > now))
            .OrderByDescending(r => r.EffectiveFrom)
            .ToListAsync(ct);

        var map = new Dictionary<(string, string), decimal>();
        foreach (var r in rows)
        {
            var key = (Normalize(r.FromCurrency)!, Normalize(r.ToCurrency)!);
            if (!map.ContainsKey(key)) map[key] = r.Rate; // first = latest EffectiveFrom
        }
        _rates = map;
    }

    private static decimal Round(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);

    internal static string? Normalize(string? code) =>
        string.IsNullOrWhiteSpace(code) ? null : code.Trim().ToUpperInvariant();
}

/// <summary>Fills <see cref="ExchangeRate"/> when empty. Rates are placeholders for local/dev until ops
/// replaces them — documented here and in the task notes, not invented per request.</summary>
public static class ExchangeRateSeeder
{
    /// <summary>USD→BDT used when the old storefront hard-coded ~110. Inverse stored explicitly so we never
    /// silently invert a stale rate.</summary>
    public const decimal UsdToBdt = 110m;

    public static async Task SeedAsync(OtaDbContext db, ILogger logger, CancellationToken ct = default)
    {
        if (await db.ExchangeRates.AnyAsync(ct)) return;

        var from = DateTimeOffset.UtcNow.AddYears(-1);
        db.ExchangeRates.AddRange(
            Rate("USD", "BDT", UsdToBdt, from),
            Rate("BDT", "USD", RoundInverse(UsdToBdt), from),
            Rate("EUR", "BDT", 120m, from),
            Rate("BDT", "EUR", RoundInverse(120m), from),
            Rate("GBP", "BDT", 140m, from),
            Rate("BDT", "GBP", RoundInverse(140m), from));
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} exchange rates (placeholder USD→BDT={Rate}). Replace via PlatformAdmin POST /api/v1/exchange-rates (or the ExchangeRates table).",
            6, UsdToBdt);
    }

    private static ExchangeRate Rate(string from, string to, decimal rate, DateTimeOffset effectiveFrom) => new()
    {
        FromCurrency = from, ToCurrency = to, Rate = rate, EffectiveFrom = effectiveFrom, Source = "seed",
    };

    private static decimal RoundInverse(decimal rate) =>
        Math.Round(1m / rate, 8, MidpointRounding.AwayFromZero);
}
