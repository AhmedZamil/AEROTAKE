using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Suppliers;

namespace Ota.CoreEngine.Bookings;

/// <summary>P4-6: abandoned / unpaid holds past <see cref="Booking.TicketingDeadline"/> are cancelled locally and,
/// where the supplier supports it, released at the GDS so seats are not left dangling until the airline times them out.</summary>
public interface IHoldExpiryService
{
    /// <summary>Expires up to <paramref name="batchSize"/> overdue Pending bookings. Returns how many were marked cancelled.</summary>
    Task<int> ExpireOverdueAsync(int batchSize, CancellationToken ct);
}

public sealed class HoldExpiryService(
    OtaDbContext db,
    ISupplierProvider suppliers,
    ILogger<HoldExpiryService> logger) : IHoldExpiryService
{
    public async Task<int> ExpireOverdueAsync(int batchSize, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        // A Paid payment means the customer already paid and ticketing has not finished. Cancelling that hold
        // (and telling the supplier to drop the seat) is the reconciliation job's problem, not an abandoned cart.
        var paidBookingIds = db.Payments.IgnoreQueryFilters()
            .Where(p => p.Status == PaymentStatus.Paid)
            .Select(p => p.BookingId);
        // Cross-tenant sweep: the job is platform-wide, not scoped to one HTTP tenant.
        var overdue = await db.Bookings.IgnoreQueryFilters()
            .Where(b => b.Status == BookingStatus.Pending
                        && b.TicketingDeadline != null
                        && b.TicketingDeadline < now
                        && !paidBookingIds.Contains(b.Id))
            .OrderBy(b => b.TicketingDeadline)
            .Take(batchSize)
            .ToListAsync(ct);

        if (overdue.Count == 0) return 0;

        var cancelled = 0;
        foreach (var booking in overdue)
        {
            foreach (var hold in BookingLegs.Read(booking))
            {
                try
                {
                    await suppliers.CancelHoldAsync(hold.SupplierCode, hold.SupplierPnrId, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // Local cancel still proceeds — seats may need a manual release, but we must not leave the booking Pending.
                    logger.LogError(ex,
                        "Supplier cancel failed for booking {BookingId} PNR {Pnr} ({Supplier}); marking cancelled locally",
                        booking.Id, booking.Pnr, hold.SupplierCode);
                }
            }

            booking.Status = BookingStatus.Cancelled;
            booking.UpdatedAt = now;
            cancelled++;
            logger.LogInformation(
                "Expired unpaid hold {BookingId} PNR {Pnr} (deadline {Deadline}, channel {Channel})",
                booking.Id, booking.Pnr, booking.TicketingDeadline, booking.Channel);
        }

        await db.SaveChangesAsync(ct);
        return cancelled;
    }
}

/// <summary>Runs <see cref="IHoldExpiryService"/> on an interval. Interval is configurable via
/// <c>B2C:HoldExpiryIntervalSeconds</c> (default 60). Set <c>B2C:HoldExpiryEnabled=false</c> to disable
/// (tests call the service directly).</summary>
public sealed class HoldExpiryJob(IServiceScopeFactory scopes, IConfiguration config, ILogger<HoldExpiryJob> logger) : BackgroundService
{
    private bool Enabled => !string.Equals(config["B2C:HoldExpiryEnabled"], "false", StringComparison.OrdinalIgnoreCase);

    private TimeSpan Interval
    {
        get
        {
            var seconds = int.TryParse(config["B2C:HoldExpiryIntervalSeconds"], out var s) && s > 0 ? s : 60;
            return TimeSpan.FromSeconds(seconds);
        }
    }

    private int BatchSize =>
        int.TryParse(config["B2C:HoldExpiryBatchSize"], out var n) && n > 0 ? n : 100;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Delay first so a cold start does not race request handling / test setup.
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }

            if (!Enabled) continue;

            try
            {
                using var scope = scopes.CreateScope();
                var expired = await scope.ServiceProvider.GetRequiredService<IHoldExpiryService>()
                    .ExpireOverdueAsync(BatchSize, stoppingToken);
                if (expired > 0) logger.LogInformation("Hold expiry cancelled {Count} overdue Pending booking(s)", expired);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Hold expiry sweep failed; will retry");
            }
        }
    }
}
