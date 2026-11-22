using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using BookingStatus = Ota.CoreEngine.Domain.BookingStatus;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P4-7: paid bookings that are not Confirmed are detected and alerted. The sweep does not refund or change the booking.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class PaymentReconciliationTests(OtaCoreEngineFixture fixture)
{
    private async Task<Booking> SeedAsync(string tenant, BookingStatus status, DateTimeOffset paidAt)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var booking = new Booking
        {
            TenantId = tenant,
            Channel = BookingChannels.B2C,
            GuestEmail = "recon@example.test",
            Pnr = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            OfferId = "X",
            SupplierCode = "HAJEE",
            SupplierPnrId = "HJ-" + Guid.NewGuid().ToString("N")[..6],
            IdempotencyKey = Guid.NewGuid().ToString(),
            Status = status,
            FinalPrice = 250m,
            Currency = "BDT",
            SupplierNetRate = 200m,
            TicketingDeadline = DateTimeOffset.UtcNow.AddMinutes(-5),
            TravelersJson = "[]",
        };
        db.Bookings.Add(booking);
        db.Payments.Add(new Payment
        {
            TenantId = tenant,
            BookingId = booking.Id,
            Amount = booking.FinalPrice,
            Currency = booking.Currency,
            Status = PaymentStatus.Paid,
            Gateway = PaymentGateways.SslCommerz,
            TranId = "recon-" + Guid.NewGuid().ToString("N")[..12],
            PaidAt = paidAt,
        });
        await db.SaveChangesAsync();
        return booking;
    }

    private async Task SweepAsync()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IPaymentReconciliationService>().AlertInconsistentAsync(500, default);
    }

    private bool Alerted(string pnr) =>
        fixture.AlertNotifier.Calls.Any(c => c.Title.Contains(pnr, StringComparison.Ordinal) && c.Exception is PaymentReconciliationException);

    [Fact]
    public async Task APaidBookingStillPending_PastTheGraceWindow_IsAlerted_AndLeftUnchanged()
    {
        fixture.AlertNotifier.Clear();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var seeded = await SeedAsync(tenant, BookingStatus.Pending, DateTimeOffset.UtcNow.AddMinutes(-30));

        await SweepAsync();

        Assert.True(Alerted(seeded.Pnr));
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var booking = await db.Bookings.IgnoreQueryFilters().SingleAsync(b => b.Id == seeded.Id);
        var payment = await db.Payments.IgnoreQueryFilters().SingleAsync(p => p.BookingId == seeded.Id);
        Assert.Equal(BookingStatus.Pending, booking.Status);
        Assert.Equal(PaymentStatus.Paid, payment.Status);
        Assert.Empty(await db.Refunds.IgnoreQueryFilters().Where(r => r.PaymentId == payment.Id).ToListAsync());
    }

    [Fact]
    public async Task APaidBookingThatWasJustPaid_IsNotAlerted()
    {
        fixture.AlertNotifier.Clear();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var seeded = await SeedAsync(tenant, BookingStatus.Pending, DateTimeOffset.UtcNow.AddMinutes(-1));

        await SweepAsync();

        Assert.False(Alerted(seeded.Pnr));
    }

    [Fact]
    public async Task APaidAndConfirmedBooking_IsNotAlerted()
    {
        fixture.AlertNotifier.Clear();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var seeded = await SeedAsync(tenant, BookingStatus.Confirmed, DateTimeOffset.UtcNow.AddMinutes(-30));

        await SweepAsync();

        Assert.False(Alerted(seeded.Pnr));
    }

    [Fact]
    public async Task APaidBookingThatWasCancelled_IsAlerted()
    {
        fixture.AlertNotifier.Clear();
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var seeded = await SeedAsync(tenant, BookingStatus.Cancelled, DateTimeOffset.UtcNow.AddMinutes(-30));

        await SweepAsync();

        Assert.True(Alerted(seeded.Pnr));
        using var scope = fixture.Factory.Services.CreateScope();
        var status = await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings
            .IgnoreQueryFilters().Where(b => b.Id == seeded.Id).Select(b => b.Status).SingleAsync();
        Assert.Equal(BookingStatus.Cancelled, status);
    }
}
