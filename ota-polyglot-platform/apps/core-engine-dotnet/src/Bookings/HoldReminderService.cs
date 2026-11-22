using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Bookings;

/// <summary>P5-18: remind customers whose unpaid B2C hold is about to expire so they can still pay.</summary>
public interface IHoldReminderService
{
    /// <summary>Sends hold-expiring mail for up to <paramref name="batchSize"/> bookings. Returns how many were emailed.</summary>
    Task<int> RemindAsync(int batchSize, CancellationToken ct);
}

public sealed class HoldReminderService(
    OtaDbContext db,
    IBookingEmailService emails,
    IConfiguration config,
    ILogger<HoldReminderService> logger) : IHoldReminderService
{
    private TimeSpan LeadTime
    {
        get
        {
            var minutes = int.TryParse(config["B2C:HoldReminderMinutesBefore"], out var m) && m > 0 ? m : 10;
            return TimeSpan.FromMinutes(minutes);
        }
    }

    public async Task<int> RemindAsync(int batchSize, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var windowEnd = now + LeadTime;
        var paidBookingIds = db.Payments.IgnoreQueryFilters()
            .Where(p => p.Status == PaymentStatus.Paid)
            .Select(p => p.BookingId);

        var due = await db.Bookings.IgnoreQueryFilters()
            .Where(b => b.Channel == BookingChannels.B2C
                        && b.Status == BookingStatus.Pending
                        && b.HoldReminderSentAt == null
                        && b.TicketingDeadline != null
                        && b.TicketingDeadline > now
                        && b.TicketingDeadline <= windowEnd
                        && !paidBookingIds.Contains(b.Id))
            .OrderBy(b => b.TicketingDeadline)
            .Take(batchSize)
            .ToListAsync(ct);

        if (due.Count == 0) return 0;

        var sent = 0;
        foreach (var booking in due)
        {
            // Only stamp HoldReminderSentAt after a successful hand-off so a temporary SMTP outage can retry.
            if (!await emails.NotifyHoldExpiringAsync(booking, ct)) continue;
            booking.HoldReminderSentAt = now;
            booking.UpdatedAt = now;
            sent++;
            logger.LogInformation(
                "Sent hold-expiring reminder for {BookingId} PNR {Pnr} (deadline {Deadline})",
                booking.Id, booking.Pnr, booking.TicketingDeadline);
        }

        await db.SaveChangesAsync(ct);
        return sent;
    }
}

/// <summary>Runs <see cref="IHoldReminderService"/> on an interval. Interval via
/// <c>B2C:HoldReminderIntervalSeconds</c> (default 60). Set <c>B2C:HoldReminderEnabled=false</c> to disable
/// (tests call the service directly).</summary>
public sealed class HoldReminderJob(IServiceScopeFactory scopes, IConfiguration config, ILogger<HoldReminderJob> logger) : BackgroundService
{
    private bool Enabled => !string.Equals(config["B2C:HoldReminderEnabled"], "false", StringComparison.OrdinalIgnoreCase);

    private TimeSpan Interval
    {
        get
        {
            var seconds = int.TryParse(config["B2C:HoldReminderIntervalSeconds"], out var s) && s > 0 ? s : 60;
            return TimeSpan.FromSeconds(seconds);
        }
    }

    private int BatchSize =>
        int.TryParse(config["B2C:HoldReminderBatchSize"], out var n) && n > 0 ? n : 100;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }

            if (!Enabled) continue;

            try
            {
                using var scope = scopes.CreateScope();
                var reminded = await scope.ServiceProvider.GetRequiredService<IHoldReminderService>()
                    .RemindAsync(BatchSize, stoppingToken);
                if (reminded > 0) logger.LogInformation("Hold reminder emailed {Count} booking(s)", reminded);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Hold reminder sweep failed; will retry");
            }
        }
    }
}
