using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Suppliers;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using BookingStatus = Ota.CoreEngine.Domain.BookingStatus;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P4-6: unpaid Pending holds past <see cref="Booking.TicketingDeadline"/> are cancelled locally and the supplier hold is released when possible.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class HoldExpiryTests(OtaCoreEngineFixture fixture)
{
    private sealed class TrackingSupplier : ISupplierProvider
    {
        public string SupplierCode => "SABRE";
        public readonly List<(string Code, string Pnr)> Cancels = [];
        public bool ThrowOnCancel;

        public Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<SupplierOfferResult>>([]);
        public Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) => Task.FromResult<decimal?>(null);
        public Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) => Task.FromResult(0m);
        public Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct) =>
            Task.FromResult(new RevalidateResult(false, 0, "n/a"));
        public Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct) =>
            Task.FromResult(new SupplierBookingResult(false, null, "n/a", "{}"));
        public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct) =>
            Task.FromResult(new TicketIssueResult(false, "n/a", "{}"));
        public Task CancelHoldAsync(string supplierCode, string supplierPnrId, CancellationToken ct)
        {
            if (ThrowOnCancel) throw new InvalidOperationException("supplier cancel blew up");
            Cancels.Add((supplierCode, supplierPnrId));
            return Task.CompletedTask;
        }
    }

    private (TrackingSupplier Supplier, WebApplicationFactory<Program> Factory) Host(Action<TrackingSupplier>? configure = null)
    {
        var supplier = new TrackingSupplier();
        configure?.Invoke(supplier);
        var factory = fixture.Factory.WithWebHostBuilder(b =>
        {
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["B2C:HoldExpiryEnabled"] = "false", // tests call ExpireOverdueAsync directly
            }));
            b.ConfigureServices(s =>
            {
                s.RemoveAll<ISupplierProvider>();
                s.AddSingleton<ISupplierProvider>(supplier);
            });
        });
        return (supplier, factory);
    }

    /// <summary>The shared test DB may already hold overdue Pending rows from earlier runs; drain them so batch counts are deterministic.</summary>
    private static async Task DrainAsync(WebApplicationFactory<Program> factory)
    {
        for (var i = 0; i < 20; i++)
        {
            using var scope = factory.Services.CreateScope();
            if (await scope.ServiceProvider.GetRequiredService<IHoldExpiryService>().ExpireOverdueAsync(500, default) == 0) return;
        }
    }

    private async Task<(TrackingSupplier Supplier, Booking Reloaded)> RunAsync(
        Func<OtaDbContext, string, Task<Booking>> seed,
        Action<TrackingSupplier>? configure = null)
    {
        var (supplier, factory) = Host(configure);
        await DrainAsync(factory);
        supplier.Cancels.Clear(); // drain may have cancelled leftovers from earlier runs
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);

        Booking seeded;
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
            seeded = await seed(scope.ServiceProvider.GetRequiredService<OtaDbContext>(), tenant);

        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IHoldExpiryService>().ExpireOverdueAsync(100, default);

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var row = await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings
                .IgnoreQueryFilters().SingleAsync(b => b.Id == seeded.Id);
            return (supplier, row);
        }
    }

    private static Booking PendingHold(string tenant, DateTimeOffset? deadline, string? supplierPnr = "SUP-HOLD-1", BookingStatus status = BookingStatus.Pending) => new()
    {
        TenantId = tenant,
        Channel = BookingChannels.B2C,
        GuestEmail = "cart@example.test",
        Pnr = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
        OfferId = "X",
        SupplierCode = "SABRE",
        SupplierPnrId = supplierPnr,
        IdempotencyKey = Guid.NewGuid().ToString(),
        Status = status,
        FinalPrice = 250m,
        Currency = "BDT",
        SupplierNetRate = 200m,
        TicketingDeadline = deadline,
        TravelersJson = "[]",
    };

    [Fact]
    public async Task AnOverduePendingHold_IsCancelled_AndTheSupplierIsAskedToReleaseIt()
    {
        var pnr = $"HOLD-{Guid.NewGuid():N}"[..12];
        var (supplier, row) = await RunAsync(async (db, tenant) =>
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(-5), pnr);
            db.Bookings.Add(b);
            await db.SaveChangesAsync();
            return b;
        });

        Assert.Equal(BookingStatus.Cancelled, row.Status);
        Assert.Contains(supplier.Cancels, c => c == ("SABRE", pnr));
    }

    [Fact]
    public async Task AHoldStillInsideItsPaymentWindow_IsLeftAlone()
    {
        var pnr = $"HOLD-{Guid.NewGuid():N}"[..12];
        var (supplier, row) = await RunAsync(async (db, tenant) =>
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(20), pnr);
            db.Bookings.Add(b);
            await db.SaveChangesAsync();
            return b;
        });

        Assert.Equal(BookingStatus.Pending, row.Status);
        Assert.DoesNotContain(supplier.Cancels, c => c.Pnr == pnr);
    }

    [Fact]
    public async Task AnOverdueHoldThatIsAlreadyPaid_IsLeftAlone()
    {
        var pnr = $"HOLD-{Guid.NewGuid():N}"[..12];
        var (supplier, row) = await RunAsync(async (db, tenant) =>
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(-5), pnr);
            db.Bookings.Add(b);
            db.Payments.Add(new Payment
            {
                TenantId = tenant,
                BookingId = b.Id,
                Amount = b.FinalPrice,
                Currency = b.Currency,
                Status = PaymentStatus.Paid,
                Gateway = PaymentGateways.SslCommerz,
                TranId = "paid-" + Guid.NewGuid().ToString("N")[..12],
                PaidAt = DateTimeOffset.UtcNow.AddMinutes(-4),
            });
            await db.SaveChangesAsync();
            return b;
        });

        Assert.Equal(BookingStatus.Pending, row.Status);
        Assert.DoesNotContain(supplier.Cancels, c => c.Pnr == pnr);
    }

    [Fact]
    public async Task AnOverdueMultiCityHold_ReleasesEveryLeg()
    {
        var first = $"A-{Guid.NewGuid():N}"[..10];
        var second = $"B-{Guid.NewGuid():N}"[..10];
        var (supplier, row) = await RunAsync(async (db, tenant) =>
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(-5), first);
            b.LegsJson = System.Text.Json.JsonSerializer.Serialize(new[]
            {
                new BookingLegHold(b.OfferId, "SABRE", first),
                new BookingLegHold("SABRE-second", "SABRE", second),
            });
            db.Bookings.Add(b);
            await db.SaveChangesAsync();
            return b;
        });

        Assert.Equal(BookingStatus.Cancelled, row.Status);
        Assert.Contains(supplier.Cancels, c => c.Pnr == first);
        Assert.Contains(supplier.Cancels, c => c.Pnr == second);
    }

    [Fact]
    public async Task AConfirmedBooking_PastItsDeadline_IsNotCancelled()
    {
        var pnr = $"HOLD-{Guid.NewGuid():N}"[..12];
        var (supplier, row) = await RunAsync(async (db, tenant) =>
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddHours(-1), pnr, BookingStatus.Confirmed);
            db.Bookings.Add(b);
            await db.SaveChangesAsync();
            return b;
        });

        Assert.Equal(BookingStatus.Confirmed, row.Status);
        Assert.DoesNotContain(supplier.Cancels, c => c.Pnr == pnr);
    }

    [Fact]
    public async Task ASupplierCancelFailure_StillMarksTheBookingCancelledLocally()
    {
        var (_, row) = await RunAsync(async (db, tenant) =>
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(-1), $"HOLD-{Guid.NewGuid():N}"[..12]);
            db.Bookings.Add(b);
            await db.SaveChangesAsync();
            return b;
        }, configure: s => s.ThrowOnCancel = true);

        Assert.Equal(BookingStatus.Cancelled, row.Status);
    }

    [Fact]
    public async Task ABookingWithNoSupplierPnr_IsCancelledWithoutCallingTheSupplier()
    {
        var (supplier, row) = await RunAsync(async (db, tenant) =>
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(-1), supplierPnr: null);
            db.Bookings.Add(b);
            await db.SaveChangesAsync();
            return b;
        });

        Assert.Equal(BookingStatus.Cancelled, row.Status);
        Assert.Empty(supplier.Cancels);
    }

    [Fact]
    public async Task TheSweep_SeesBookingsAcrossTenants_AndRespectsBatchSize()
    {
        var (supplier, factory) = Host();
        await DrainAsync(factory);
        supplier.Cancels.Clear();

        var tenantA = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var tenantB = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var (a1, a2, b1) = ($"A1-{Guid.NewGuid():N}"[..10], $"A2-{Guid.NewGuid():N}"[..10], $"B1-{Guid.NewGuid():N}"[..10]);

        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenantA))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            db.Bookings.Add(PendingHold(tenantA, DateTimeOffset.UtcNow.AddMinutes(-10), a1));
            db.Bookings.Add(PendingHold(tenantA, DateTimeOffset.UtcNow.AddMinutes(-9), a2));
            await db.SaveChangesAsync();
        }
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenantB))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            db.Bookings.Add(PendingHold(tenantB, DateTimeOffset.UtcNow.AddMinutes(-8), b1));
            await db.SaveChangesAsync();
        }

        int first, second;
        using (var scope = factory.Services.CreateScope())
            first = await scope.ServiceProvider.GetRequiredService<IHoldExpiryService>().ExpireOverdueAsync(2, default);
        using (var scope = factory.Services.CreateScope())
            second = await scope.ServiceProvider.GetRequiredService<IHoldExpiryService>().ExpireOverdueAsync(10, default);

        Assert.Equal(2, first);
        Assert.Equal(1, second);
        Assert.Equal(3, supplier.Cancels.Count);
        Assert.Contains(supplier.Cancels, c => c.Pnr == a1);
        Assert.Contains(supplier.Cancels, c => c.Pnr == a2);
        Assert.Contains(supplier.Cancels, c => c.Pnr == b1);
    }
}
