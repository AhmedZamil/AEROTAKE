using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using BookingStatus = Ota.CoreEngine.Domain.BookingStatus;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P5-18: unpaid holds approaching <see cref="Booking.TicketingDeadline"/> get one reminder email.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class HoldReminderTests(OtaCoreEngineFixture fixture)
{
    private readonly FakeEmailSender _mail = new();

    private WebApplicationFactory<Program> Factory() => fixture.Factory.WithWebHostBuilder(b =>
    {
        b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["B2C:HoldReminderEnabled"] = "false",
            ["B2C:HoldReminderMinutesBefore"] = "15",
            ["STOREFRONT_PUBLIC_URL"] = "http://localhost:3001",
        }));
        b.ConfigureServices(s =>
        {
            s.RemoveAll<IEmailSender>();
            s.AddSingleton<IEmailSender>(_mail);
        });
    });

    /// <summary>Shared test DB may already hold unpaid Pending rows inside the reminder window; stamp them so counts stay deterministic.</summary>
    private static async Task DrainAsync(WebApplicationFactory<Program> factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var now = DateTimeOffset.UtcNow;
        await db.Bookings.IgnoreQueryFilters()
            .Where(b => b.HoldReminderSentAt == null
                        && b.Status == BookingStatus.Pending
                        && b.TicketingDeadline != null
                        && b.TicketingDeadline <= now.AddMinutes(20))
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.HoldReminderSentAt, now));
    }

    private static Booking PendingHold(string tenant, DateTimeOffset? deadline, DateTimeOffset? remindedAt = null) => new()
    {
        TenantId = tenant,
        Channel = BookingChannels.B2C,
        CustomerEmail = "soon@example.test",
        Pnr = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
        OfferId = "X",
        SupplierCode = "SABRE",
        SupplierPnrId = "SUP-REM-1",
        IdempotencyKey = Guid.NewGuid().ToString(),
        Status = BookingStatus.Pending,
        FinalPrice = 250m,
        Currency = "BDT",
        SupplierNetRate = 200m,
        TicketingDeadline = deadline,
        HoldReminderSentAt = remindedAt,
        TravelersJson = """[{"FirstName":"Sam","LastName":"Rahman"}]""",
        ItineraryJson = null,
    };

    [Fact]
    public async Task AHoldInsideTheReminderWindow_IsEmailedOnce()
    {
        var factory = Factory();
        await DrainAsync(factory);
        while (_mail.Sent.TryDequeue(out _)) { }

        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        Guid bookingId;
        string pnr;
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(8));
            scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings.Add(b);
            await scope.ServiceProvider.GetRequiredService<OtaDbContext>().SaveChangesAsync();
            bookingId = b.Id;
            pnr = b.Pnr;
        }

        using (var scope = factory.Services.CreateScope())
        {
            var sent = await scope.ServiceProvider.GetRequiredService<IHoldReminderService>().RemindAsync(100, default);
            Assert.Equal(1, sent);
        }

        var mail = Assert.Single(_mail.Sent);
        Assert.Equal("soon@example.test", mail.To);
        Assert.Contains(pnr, mail.Subject);
        Assert.Contains("expir", mail.Subject, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("http://localhost:3001/my-bookings", mail.Body);

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var row = await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings
                .IgnoreQueryFilters().SingleAsync(b => b.Id == bookingId);
            Assert.NotNull(row.HoldReminderSentAt);
        }

        using (var scope = factory.Services.CreateScope())
            Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<IHoldReminderService>().RemindAsync(100, default));
        Assert.Single(_mail.Sent);
    }

    [Fact]
    public async Task AHoldStillFarFromDeadline_IsNotReminded()
    {
        var factory = Factory();
        await DrainAsync(factory);
        while (_mail.Sent.TryDequeue(out _)) { }

        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings.Add(
                PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(40)));
            await scope.ServiceProvider.GetRequiredService<OtaDbContext>().SaveChangesAsync();
        }

        using var remindScope = factory.Services.CreateScope();
        Assert.Equal(0, await remindScope.ServiceProvider.GetRequiredService<IHoldReminderService>().RemindAsync(100, default));
        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task APaidHold_IsNotReminded()
    {
        var factory = Factory();
        await DrainAsync(factory);
        while (_mail.Sent.TryDequeue(out _)) { }

        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(5));
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
                PaidAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        using var remindScope = factory.Services.CreateScope();
        Assert.Equal(0, await remindScope.ServiceProvider.GetRequiredService<IHoldReminderService>().RemindAsync(100, default));
        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task SmtpDown_LeavesReminderUnset_SoTheNextSweepCanRetry()
    {
        _mail.Fail = true;
        var factory = Factory();
        await DrainAsync(factory);
        while (_mail.Sent.TryDequeue(out _)) { }

        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        Guid bookingId;
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            var b = PendingHold(tenant, DateTimeOffset.UtcNow.AddMinutes(5));
            scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings.Add(b);
            await scope.ServiceProvider.GetRequiredService<OtaDbContext>().SaveChangesAsync();
            bookingId = b.Id;
        }

        using (var scope = factory.Services.CreateScope())
            Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<IHoldReminderService>().RemindAsync(100, default));

        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var row = await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings
                .IgnoreQueryFilters().SingleAsync(b => b.Id == bookingId);
            Assert.Null(row.HoldReminderSentAt);
        }
        Assert.Empty(_mail.Sent);
    }
}
