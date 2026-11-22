using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;

namespace Ota.CoreEngine.CustomerAuth;

/// <summary>Whether a customer's session is still good, and the ways one ends. Everything here is DURABLE (Postgres): a revocation
/// that lives in a cache can be evicted or lost, and a lost revocation quietly brings a stolen token back to life.
///
/// A session is one sign-in chain: the tokens issued by a sign-in and by every refresh of it share a session id. A session is over if
///   * it was signed out ("sid:{id}" recorded),
///   * the customer signed out EVERYWHERE after it began (Customer.TokensValidAfter), or
///   * the customer is suspended or erased (checked live, so suspension takes effect at once, not 15 minutes later).</summary>
public interface ICustomerSessions
{
    /// <summary>Is a token from this customer and session, issued at this instant, still good? Uses no ambient tenant — authentication
    /// runs before the tenant is established — so it names the tenant explicitly.</summary>
    Task<bool> IsValidAsync(string tenantId, Guid customerId, string sessionId, long issuedAtMs, CancellationToken ct);

    /// <summary>Ends one session: its refresh token and every access token in the chain stop working immediately.</summary>
    Task EndSessionAsync(string sessionId, DateTimeOffset until, CancellationToken ct);

    /// <summary>Ends every session this customer has, on every device, as of now.</summary>
    Task EndAllSessionsAsync(string tenantId, Guid customerId, CancellationToken ct);

    /// <summary>Marks a refresh token as used, atomically. True if THIS call did it; false if it had already been used — so of two
    /// simultaneous refreshes with one token exactly one wins.</summary>
    Task<bool> TryUseRefreshTokenAsync(string tokenId, DateTimeOffset tokenExpiresAt, CancellationToken ct);
}

public sealed class CustomerSessions(OtaDbContext db) : ICustomerSessions
{
    private static string SessionKey(string sid) => $"sid:{sid}";
    private static string RefreshKey(string jti) => $"jti:{jti}";

    public async Task<bool> IsValidAsync(string tenantId, Guid customerId, string sessionId, long issuedAtMs, CancellationToken ct)
    {
        // IgnoreQueryFilters + an explicit tenant: the tenant filter reads the ambient tenant, which is not set yet at this point.
        var customer = await db.Customers.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.Id == customerId && c.TenantId == tenantId)
            .Select(c => new { c.IsActive, c.DeletedAt, c.TokensValidAfter })
            .FirstOrDefaultAsync(ct);
        if (customer is null || !customer.IsActive || customer.DeletedAt is not null) return false;
        if (customer.TokensValidAfter is { } cutoff && issuedAtMs < cutoff.ToUnixTimeMilliseconds()) return false;

        var key = SessionKey(sessionId);
        return !await db.RevokedTokens.AsNoTracking().AnyAsync(r => r.TokenId == key, ct);
    }

    public Task EndSessionAsync(string sessionId, DateTimeOffset until, CancellationToken ct) => InsertOnceAsync(SessionKey(sessionId), until, ct);

    public async Task EndAllSessionsAsync(string tenantId, Guid customerId, CancellationToken ct) =>
        await db.Customers.IgnoreQueryFilters().Where(c => c.Id == customerId && c.TenantId == tenantId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.TokensValidAfter, DateTimeOffset.UtcNow), ct);

    public async Task<bool> TryUseRefreshTokenAsync(string tokenId, DateTimeOffset tokenExpiresAt, CancellationToken ct) =>
        await InsertOnceAsync(RefreshKey(tokenId), tokenExpiresAt, ct);

    /// <summary>One INSERT that either creates the row or does nothing — so exactly one caller can ever win, however many race.</summary>
    private async Task<bool> InsertOnceAsync(string id, DateTimeOffset expiresAt, CancellationToken ct)
    {
        if (expiresAt <= DateTimeOffset.UtcNow) return false; // already expired: dead regardless
        var affected = await db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO \"identity_customers\".\"RevokedTokens\" (\"TokenId\", \"RevokedAt\", \"ExpiresAt\") VALUES ({id}, {DateTimeOffset.UtcNow}, {expiresAt}) ON CONFLICT (\"TokenId\") DO NOTHING", ct);
        return affected == 1;
    }
}

/// <summary>Deletes revocation records once the tokens they cover have expired anyway, so the table stays small.</summary>
public sealed class ExpiredRevocationsSweeper(IServiceScopeFactory scopes, ILogger<ExpiredRevocationsSweeper> logger) : BackgroundService
{
    private static readonly TimeSpan Every = TimeSpan.FromHours(6);

    /// <summary>One sweep; returns how many rows went. (Public so a test can run it.)</summary>
    public static async Task<int> SweepAsync(OtaDbContext db, CancellationToken ct) =>
        await db.RevokedTokens.Where(r => r.ExpiresAt < DateTimeOffset.UtcNow.AddMinutes(-5)).ExecuteDeleteAsync(ct);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var removed = await SweepAsync(scope.ServiceProvider.GetRequiredService<OtaDbContext>(), stoppingToken);
                if (removed > 0) logger.LogInformation("Removed {Count} expired token revocation record(s)", removed);
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogError(ex, "Revocation sweep failed; will retry"); }
            try { await Task.Delay(Every, stoppingToken); } catch (OperationCanceledException) { }
        }
    }
}
