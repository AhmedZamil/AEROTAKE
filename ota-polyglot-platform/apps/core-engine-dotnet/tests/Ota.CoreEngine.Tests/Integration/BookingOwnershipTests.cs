using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P2-3: every booking records the channel it came through and who owns it, and the database refuses a
/// combination that makes no sense (an agent-channel booking with no agent, a B2C booking charged to an agent,
/// a customer on an agent booking) — so no code path, present or future, can write one.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class BookingOwnershipTests(OtaCoreEngineFixture fixture)
{
    private static Booking NewBooking(string tenantId, string channel, Guid? agentId = null, Guid? subAgentId = null,
        Guid? customerId = null, string? guestEmail = null) => new()
    {
        TenantId = tenantId, Channel = channel, AgentId = agentId, SubAgentId = subAgentId, CustomerId = customerId, GuestEmail = guestEmail,
        Pnr = Guid.NewGuid().ToString("N")[..6], OfferId = "AMADEUS-owner", SupplierCode = "AMADEUS",
        IdempotencyKey = $"key-{Guid.NewGuid()}", Status = BookingStatus.Pending, FinalPrice = 100m, Currency = "USD",
    };

    private async Task<(bool Saved, string? Constraint)> TrySaveAsync(Booking booking)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, booking.TenantId);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        db.Bookings.Add(booking);
        try { await db.SaveChangesAsync(); return (true, null); }
        catch (DbUpdateException ex) { return (false, (ex.InnerException as Npgsql.PostgresException)?.ConstraintName); }
    }

    [Fact]
    public async Task AnAgentChannelBooking_WithAnAgent_IsAccepted()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        foreach (var channel in BookingChannels.AgentOwned)
            Assert.True((await TrySaveAsync(NewBooking(tenantId, channel, agentId))).Saved, channel);
    }

    [Fact]
    public async Task AGuestB2CBooking_WithNoAgentAndNoCustomer_IsAccepted()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.True((await TrySaveAsync(NewBooking(tenantId, BookingChannels.B2C, guestEmail: "guest@example.test"))).Saved);
    }

    [Fact]
    public async Task ACustomerB2CBooking_IsAccepted()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        Guid customerId;
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenantId))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            var customer = new Customer { TenantId = tenantId, Email = $"{Guid.NewGuid():N}@example.test" };
            db.Customers.Add(customer);
            await db.SaveChangesAsync();
            customerId = customer.Id;
        }

        Assert.True((await TrySaveAsync(NewBooking(tenantId, BookingChannels.B2C, customerId: customerId))).Saved);
    }

    [Fact]
    public async Task AnAgentChannelBooking_WithoutAnAgent_IsRefused()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal((false, "CK_Bookings_Owner"), await TrySaveAsync(NewBooking(tenantId, BookingChannels.B2BAgent)));
    }

    [Fact]
    public async Task AB2CBooking_ChargedToAnAgent_IsRefused()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal((false, "CK_Bookings_Owner"), await TrySaveAsync(NewBooking(tenantId, BookingChannels.B2C, agentId: agentId)));
        Assert.Equal((false, "CK_Bookings_Owner"), await TrySaveAsync(NewBooking(tenantId, BookingChannels.B2C, subAgentId: agentId)));
    }

    [Fact]
    public async Task AnAgentBooking_ThatAlsoNamesACustomer_IsRefused()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal((false, "CK_Bookings_Owner"), await TrySaveAsync(NewBooking(tenantId, BookingChannels.B2BAgent, agentId, customerId: Guid.NewGuid())));
    }

    [Theory]
    [InlineData("")]
    [InlineData("PLATFORM")]
    [InlineData("b2c")]
    public async Task AnUnknownChannel_IsRefused(string channel)
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal((false, "CK_Bookings_Channel"), await TrySaveAsync(NewBooking(tenantId, channel, agentId)));
    }

    [Fact]
    public async Task TheChannelHasNoDatabaseDefault_SoAForgottenOneFailsLoudly()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();

        var defaults = await db.Database.SqlQueryRaw<string>(
            "SELECT column_default AS \"Value\" FROM information_schema.columns WHERE table_name = 'Bookings' AND column_name = 'Channel'").ToListAsync();

        Assert.Single(defaults);
        Assert.Null(defaults[0]);
    }

    [Fact]
    public async Task AReservationRecordsTheChannelItWasMadeThrough()
    {
        var (tenantId, agentId, token) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-channel-recorded");
        var client = new Ota.CoreEngine.Grpc.OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(token));

        var reserved = await client.ProcessB2BBookingAsync(new Ota.CoreEngine.Grpc.B2BBookingRequest
        {
            OfferId = "AMADEUS-channel-recorded", IdempotencyKey = $"key-{Guid.NewGuid()}", ContactEmail = "ops@test.example",
            Travelers = { new Ota.CoreEngine.Grpc.Traveler { FirstName = "T", LastName = "T", DocumentType = "PASSPORT", DocumentNumber = "P1" } },
        });

        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var stored = await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings.SingleAsync(b => b.Id == Guid.Parse(reserved.BookingId));
        Assert.Equal(BookingChannels.B2BAgent, stored.Channel);
        Assert.Equal(agentId, stored.AgentId);
    }
}
