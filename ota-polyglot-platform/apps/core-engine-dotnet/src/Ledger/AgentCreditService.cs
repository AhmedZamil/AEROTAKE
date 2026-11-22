using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Ledger;

public sealed record CreditCheckResult(bool Approved, decimal AvailableAfter, string? Reason);

public interface IAgentCreditService
{
    Task<CreditCheckResult> VerifyAndReserveAsync(Guid agentId, decimal amount, Guid bookingId, string reference, CancellationToken ct);
    Task ReleaseAsync(Guid agentId, decimal amount, Guid bookingId, string reference, CancellationToken ct);
}

/// <summary>
/// Verifies agent balance and debits the ledger. Concurrent debits for one agent are serialised with a row
/// lock (SELECT ... FOR UPDATE on the agent), so they queue instead of colliding: every request is decided
/// against the true balance — approved, or declined for insufficient credit — never an error. The xmin
/// optimistic-concurrency token stays as a backstop against anything that touches the row without the lock;
/// if it does trip, the attempt is retried, and if retries run out the caller gets a normal declined result
/// ("Ledger contention"), never an exception.
/// </summary>
public sealed class AgentCreditService(OtaDbContext db, ILogger<AgentCreditService> logger) : IAgentCreditService
{
    private const int MaxRetries = 5;

    public async Task<CreditCheckResult> VerifyAndReserveAsync(
        Guid agentId, decimal amount, Guid bookingId, string reference, CancellationToken ct)
    {
        if (amount <= 0) return new CreditCheckResult(false, 0, "Amount must be positive.");

        // EnableRetryOnFailure's execution strategy forbids ambient user transactions
        // unless the whole unit runs inside it — wrap the per-attempt work here.
        var strategy = db.Database.CreateExecutionStrategy();

        for (var attempt = 1; attempt <= MaxRetries; attempt++)
        {
            try
            {
                return await strategy.ExecuteAsync(async () =>
                {
                    await using var tx = await db.Database.BeginTransactionAsync(ct);

                    // Take the agent's row lock BEFORE reading the balance. A concurrent debit waits here until the
                    // first one commits, then reads its result (READ COMMITTED gives each statement a fresh view).
                    // Keyed by id only: it locks, it does not read data, so the tenant filter isn't needed on it.
                    await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"identity_agents\".\"Agents\" WHERE \"Id\" = {agentId} FOR UPDATE", ct);

                    // If this context already tracks the agent from earlier in the request, its values may pre-date
                    // the lock; refresh them so the balance we check is the committed one.
                    if (db.ChangeTracker.Entries<Agent>().FirstOrDefault(e => e.Entity.Id == agentId) is { } tracked)
                        await tracked.ReloadAsync(ct);

                    var agent = await db.Agents.FirstOrDefaultAsync(a => a.Id == agentId, ct);
                    if (agent is null)
                        return new CreditCheckResult(false, 0, "Agent not found for tenant.");

                    if (agent.AvailableCredit < amount)
                    {
                        logger.LogWarning(
                            "Credit rejected for agent {AgentId}: requested {Amount}, available {Available}",
                            agentId, amount, agent.AvailableCredit);
                        return new CreditCheckResult(false, agent.AvailableCredit,
                            $"Insufficient credit. Available: {agent.AvailableCredit:F2}");
                    }

                    agent.CreditUsed += amount;
                    agent.UpdatedAt = DateTimeOffset.UtcNow;

                    db.LedgerEntries.Add(new LedgerEntry
                    {
                        TenantId = agent.TenantId,
                        AgentId = agent.Id,
                        Type = LedgerEntryType.BookingDebit,
                        Amount = amount,
                        BalanceAfter = agent.AvailableCredit,
                        BookingId = bookingId,
                        Reference = reference
                    });

                    await db.SaveChangesAsync(ct);
                    await tx.CommitAsync(ct);
                    return new CreditCheckResult(true, agent.AvailableCredit, null);
                });
            }
            catch (DbUpdateConcurrencyException ex)
            {
                // Forget only what THIS attempt touched (the conflicting rows and the ledger line it added). Clearing the
                // whole tracker would also detach entities the caller is tracking — e.g. the booking IssueTicket is about
                // to mark Confirmed — and their later SaveChanges would silently write nothing.
                foreach (var entry in ex.Entries) entry.State = EntityState.Detached;
                foreach (var added in db.ChangeTracker.Entries<LedgerEntry>().Where(e => e.State == EntityState.Added).ToList())
                    added.State = EntityState.Detached;

                if (attempt < MaxRetries)
                {
                    logger.LogInformation("Ledger concurrency conflict for agent {AgentId}, retry {Attempt}", agentId, attempt);
                    await Task.Delay(Random.Shared.Next(5, 20 * attempt), ct); // jitter, so contenders don't collide in lockstep
                }
                else
                {
                    logger.LogWarning("Ledger contention for agent {AgentId}: gave up after {Attempts} attempts", agentId, MaxRetries);
                }
            }
        }

        // Retries exhausted: a declined result like any other, not an exception — the caller answers the customer normally.
        return new CreditCheckResult(false, 0, "Ledger contention — please retry.");
    }

    public async Task ReleaseAsync(Guid agentId, decimal amount, Guid bookingId, string reference, CancellationToken ct)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            // Same row lock as VerifyAndReserveAsync, so a refund can't race a debit on the same agent.
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"identity_agents\".\"Agents\" WHERE \"Id\" = {agentId} FOR UPDATE", ct);
            if (db.ChangeTracker.Entries<Agent>().FirstOrDefault(e => e.Entity.Id == agentId) is { } tracked)
                await tracked.ReloadAsync(ct);

            var agent = await db.Agents.FirstAsync(a => a.Id == agentId, ct);
            agent.CreditUsed = Math.Max(0, agent.CreditUsed - amount);
            agent.UpdatedAt = DateTimeOffset.UtcNow;

            db.LedgerEntries.Add(new LedgerEntry
            {
                TenantId = agent.TenantId,
                AgentId = agent.Id,
                Type = LedgerEntryType.RefundCredit,
                Amount = amount,
                BalanceAfter = agent.AvailableCredit,
                BookingId = bookingId,
                Reference = reference
            });

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });
    }
}
