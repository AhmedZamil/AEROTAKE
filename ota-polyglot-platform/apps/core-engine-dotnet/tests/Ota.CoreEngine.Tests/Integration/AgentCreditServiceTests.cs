using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Update;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Ledger;
using Ota.CoreEngine.Tenancy;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>The highest-value test in this suite: proves AgentCreditService's
/// optimistic-concurrency retry loop actually prevents double-spending an
/// agent's credit limit under real concurrent load, against a real Postgres.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class AgentCreditServiceTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public async Task VerifyAndReserveAsync_ConcurrentBookings_NeverExceedsCreditLimit()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 1000m);

        // 15 concurrent attempts at 100 each = 1500 requested against a 1000
        // limit. At most 10 can mathematically succeed without overdrawing.
        const int attempts = 15;
        const decimal amountEach = 100m;

        var tasks = Enumerable.Range(0, attempts).Select(async i =>
        {
            using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
            var creditService = scope.ServiceProvider.GetRequiredService<IAgentCreditService>();
            return await creditService.VerifyAndReserveAsync(
                agentId, amountEach, Guid.NewGuid(), $"concurrency-test-{i}", CancellationToken.None);
        });

        var results = await Task.WhenAll(tasks);
        var approvedCount = results.Count(r => r.Approved);

        // Safety (the actual point of this test): total debited can never
        // exceed the credit limit no matter how many requests raced for it.
        var agent = await TestData.ReloadAgentAsync(fixture.Factory, agentId);
        Assert.True(agent.CreditUsed <= 1000m, $"CreditUsed {agent.CreditUsed} exceeded the 1000 limit — double-spend.");

        // Consistency: the ledger must exactly reconcile with what the
        // service reported as approved — no phantom or missing debits.
        var ledger = await TestData.LedgerForAsync(fixture.Factory, agentId);
        var debits = ledger.Where(l => l.Type == LedgerEntryType.BookingDebit).ToList();
        Assert.Equal(approvedCount, debits.Count);
        Assert.Equal(agent.CreditUsed, debits.Sum(l => l.Amount));

        // Debits are serialised by a row lock, so contention decides nothing: exactly the ten that fit are approved and
        // the other five are declined for insufficient credit — never lost to "contention" and never an exception.
        Assert.Equal(10, approvedCount);
        Assert.All(results.Where(r => !r.Approved), r => Assert.Contains("Insufficient credit", r.Reason));
    }

    [Fact]
    public async Task VerifyAndReserveAsync_InsufficientCredit_RejectsAndReportsAvailableBalance()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 100m);
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var creditService = scope.ServiceProvider.GetRequiredService<IAgentCreditService>();

        var result = await creditService.VerifyAndReserveAsync(agentId, 150m, Guid.NewGuid(), "over-limit", CancellationToken.None);

        Assert.False(result.Approved);
        Assert.Equal(100m, result.AvailableAfter);
        Assert.Contains("Insufficient credit", result.Reason);
    }

    [Fact]
    public async Task ReleaseAsync_RefundsCreditBackToAgent()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 500m);
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var creditService = scope.ServiceProvider.GetRequiredService<IAgentCreditService>();

        var bookingId = Guid.NewGuid();
        await creditService.VerifyAndReserveAsync(agentId, 200m, bookingId, "to-be-refunded", CancellationToken.None);
        await creditService.ReleaseAsync(agentId, 200m, bookingId, "refund", CancellationToken.None);

        var agent = await TestData.ReloadAgentAsync(fixture.Factory, agentId);
        Assert.Equal(0m, agent.CreditUsed);
        Assert.Equal(500m, agent.AvailableCredit);
    }

    // ------------------------------------------------------------------------------------------------------------
    // The failure paths of the optimistic-concurrency backstop. The row lock makes them rare in practice, so they
    // are forced here with an interceptor that throws DbUpdateConcurrencyException on SaveChanges.

    /// <summary>Throws the concurrency exception for the first <c>failures</c> saves that touch an Agent.</summary>
    private sealed class ForcedConflict(int failures) : SaveChangesInterceptor
    {
        public int Remaining = failures;

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
        {
            var agents = eventData.Context!.ChangeTracker.Entries<Agent>().Where(e => e.State == EntityState.Modified).ToList();
            if (agents.Count > 0 && Remaining > 0)
            {
                Remaining--;
#pragma warning disable EF1001 // InternalEntityEntry is how EF itself exposes IUpdateEntry
                throw new DbUpdateConcurrencyException("forced conflict", agents.Select(a => (IUpdateEntry)((IInfrastructure<Microsoft.EntityFrameworkCore.ChangeTracking.Internal.InternalEntityEntry>)a).Instance).ToList());
#pragma warning restore EF1001
            }
            return base.SavingChangesAsync(eventData, result, ct);
        }
    }

    private OtaDbContext ContextWith(ForcedConflict conflict, string tenantId)
    {
        var connection = fixture.Factory.Services.GetRequiredService<IConfiguration>()["ConnectionStrings:Postgres"];
        var accessor = new TenantAccessor();
        accessor.Set(new TenantContext { TenantId = tenantId });
        return new OtaDbContext(new DbContextOptionsBuilder<OtaDbContext>().UseNpgsql(connection).AddInterceptors(conflict).Options, accessor);
    }

    [Fact]
    public async Task WhenRetriesRunOut_TheCallerGetsADeclinedResult_NotAnException()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 1000m);
        await using var db = ContextWith(new ForcedConflict(failures: int.MaxValue), tenantId);
        var service = new AgentCreditService(db, NullLogger<AgentCreditService>.Instance);

        var result = await service.VerifyAndReserveAsync(agentId, 100m, Guid.NewGuid(), "always-conflicts", CancellationToken.None);

        Assert.False(result.Approved);
        Assert.Contains("contention", result.Reason);
        // ...and nothing was charged: the balance and the ledger are untouched.
        Assert.Equal(0m, (await TestData.ReloadAgentAsync(fixture.Factory, agentId)).CreditUsed);
        Assert.Empty((await TestData.LedgerForAsync(fixture.Factory, agentId)));
    }

    [Fact]
    public async Task ARetriedConflict_StillChargesExactlyOnce_AndKeepsTheCallersOwnTrackedChanges()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 1000m);
        var conflict = new ForcedConflict(failures: 2);
        await using var db = ContextWith(new ForcedConflict(failures: 0), tenantId); // seed the booking without conflicts
        var booking = new Booking
        {
            TenantId = tenantId, Channel = BookingChannels.B2BAgent, Pnr = "RTRY01", OfferId = "AMADEUS-retry", SupplierCode = "AMADEUS", AgentId = agentId,
            IdempotencyKey = $"key-{Guid.NewGuid()}", Status = BookingStatus.Pending, FinalPrice = 100m, Currency = "USD",
        };
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();

        // The state IssueTicket is in when it calls the credit service: a tracked booking with a pending change.
        booking.Status = BookingStatus.Confirmed;
        await using var conflicting = ContextWith(conflict, tenantId);
        conflicting.Attach(booking).State = EntityState.Modified;
        var service = new AgentCreditService(conflicting, NullLogger<AgentCreditService>.Instance);

        var result = await service.VerifyAndReserveAsync(agentId, 100m, booking.Id, "retried", CancellationToken.None);

        Assert.True(result.Approved);
        Assert.Equal(0, conflict.Remaining);                              // it really did hit conflicts first
        var ledger = await TestData.LedgerForAsync(fixture.Factory, agentId);
        Assert.Single(ledger);                                            // charged once, not once per attempt
        Assert.Equal(100m, (await TestData.ReloadAgentAsync(fixture.Factory, agentId)).CreditUsed);
        // The caller's tracked booking change was NOT thrown away by the retry (the old ChangeTracker.Clear() dropped it).
        Assert.Equal(EntityState.Unchanged, conflicting.Entry(booking).State);
        await using var verify = ContextWith(new ForcedConflict(0), tenantId);
        Assert.Equal(BookingStatus.Confirmed, (await verify.Bookings.SingleAsync(b => b.Id == booking.Id)).Status);
    }
}
