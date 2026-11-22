using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Observability;

namespace Ota.CoreEngine.Bookings;

/// <summary>P4-7: a paid booking that is not Confirmed is money and a ticket out of step.
/// This job only detects and alerts. It does not refund and it does not issue a ticket —
/// either can be wrong when we do not know whether the supplier already ticketed.</summary>
public interface IPaymentReconciliationService
{
    /// <summary>Alerts on up to <paramref name="batchSize"/> paid-but-not-confirmed bookings past the grace window. Returns how many were alerted.</summary>
    Task<int> AlertInconsistentAsync(int batchSize, CancellationToken ct);
}

public sealed class PaymentReconciliationException(string message) : Exception(message);

public sealed class PaymentReconciliationService(
    OtaDbContext db,
    IAlertNotifier alerts,
    IConfiguration config,
    ILogger<PaymentReconciliationService> logger) : IPaymentReconciliationService
{
    private TimeSpan Grace
    {
        get
        {
            var minutes = int.TryParse(config["B2C:ReconciliationGraceMinutes"], out var m) && m >= 0 ? m : 10;
            return TimeSpan.FromMinutes(minutes);
        }
    }

    public async Task<int> AlertInconsistentAsync(int batchSize, CancellationToken ct)
    {
        var cutoff = DateTimeOffset.UtcNow - Grace;
        // Cross-tenant: the job is not inside one HTTP request.
        var rows = await (
            from payment in db.Payments.IgnoreQueryFilters()
            join booking in db.Bookings.IgnoreQueryFilters() on payment.BookingId equals booking.Id
            where payment.Status == PaymentStatus.Paid
                  && booking.Status != BookingStatus.Confirmed
                  && (payment.PaidAt ?? payment.UpdatedAt ?? payment.CreatedAt) < cutoff
            orderby payment.PaidAt
            select new { payment.Id, payment.BookingId, BookingStatus = booking.Status, booking.Pnr, booking.SupplierCode }
        ).Take(batchSize).ToListAsync(ct);

        var alerted = 0;
        foreach (var row in rows)
        {
            logger.LogError(
                "Paid booking {Pnr} ({BookingId}) is {Status} — payment {PaymentId} was not followed by a confirmation",
                row.Pnr, row.BookingId, row.BookingStatus, row.Id);

            await alerts.NotifyAsync(
                $"Paid booking {row.Pnr} is not confirmed",
                new PaymentReconciliationException(
                    $"Payment {row.Id} is Paid but booking {row.Pnr} is {row.BookingStatus}."),
                new Dictionary<string, string>
                {
                    ["bookingId"] = row.BookingId.ToString(),
                    ["pnr"] = row.Pnr,
                    ["paymentId"] = row.Id.ToString(),
                    ["bookingStatus"] = row.BookingStatus.ToString(),
                    ["supplier"] = row.SupplierCode ?? "",
                },
                ct);
            alerted++;
        }

        return alerted;
    }
}

/// <summary>Runs <see cref="IPaymentReconciliationService"/> on an interval. Interval is
/// <c>B2C:ReconciliationIntervalSeconds</c> (default 60). Set <c>B2C:ReconciliationEnabled=false</c> to disable
/// (tests call the service directly). Payments younger than <c>B2C:ReconciliationGraceMinutes</c> (default 10)
/// are skipped so a payment still inside ticketing is not paged.</summary>
public sealed class PaymentReconciliationJob(
    IServiceScopeFactory scopes,
    IConfiguration config,
    ILogger<PaymentReconciliationJob> logger) : BackgroundService
{
    private bool Enabled => !string.Equals(config["B2C:ReconciliationEnabled"], "false", StringComparison.OrdinalIgnoreCase);

    private TimeSpan Interval
    {
        get
        {
            var seconds = int.TryParse(config["B2C:ReconciliationIntervalSeconds"], out var s) && s > 0 ? s : 60;
            return TimeSpan.FromSeconds(seconds);
        }
    }

    private int BatchSize =>
        int.TryParse(config["B2C:ReconciliationBatchSize"], out var n) && n > 0 ? n : 100;

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
                var alerted = await scope.ServiceProvider.GetRequiredService<IPaymentReconciliationService>()
                    .AlertInconsistentAsync(BatchSize, stoppingToken);
                if (alerted > 0) logger.LogInformation("Payment reconciliation alerted on {Count} paid booking(s) that are not confirmed", alerted);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Payment reconciliation sweep failed; will retry");
            }
        }
    }
}
