using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tests.Fixtures;
using Ota.CoreEngine.Tests.Unit;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P2-7: the SQL form of the access rules, run against real rows, using the same table as BookingAccessTests. A booking
/// the caller may not see is not loaded at all, so it cannot leak through any code that starts from these queries.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class BookingOwnershipQueryTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public async Task TheQueries_ReturnExactlyWhatThePureRuleAllows_ForEveryCallerAndBooking()
    {
        var tenant = $"own-test-{Guid.NewGuid():N}";
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();

        // real customers, so the foreign key on Booking.CustomerId is honest
        var c1 = new Customer { TenantId = tenant, Email = "c1@example.test" };
        var c2 = new Customer { TenantId = tenant, Email = "c2@example.test" };
        db.Customers.AddRange(c1, c2);
        await db.SaveChangesAsync();
        var customerIds = new Dictionary<Guid, Guid> { [BookingAccessTests.Customer1] = c1.Id, [BookingAccessTests.Customer2] = c2.Id };

        // The matrix names bookings by fixed ids (a guest's grant refers to one). The database persists between runs, so each run
        // stores them under fresh ids and translates the grants — a fixed id would collide with the previous run's rows.
        var realId = BookingAccessTests.Bookings.Where(b => b.Owner.Id is not null).ToDictionary(b => b.Owner.Id!.Value, _ => Guid.NewGuid());
        var pnrByName = new Dictionary<string, string>();
        foreach (var (name, owner) in BookingAccessTests.Bookings)
        {
            var isB2C = owner.AgentId is null;
            var booking = new Booking
            {
                Id = owner.Id is { } id ? realId[id] : Guid.NewGuid(),
                TenantId = tenant, Channel = isB2C ? BookingChannels.B2C : BookingChannels.B2BAgent,
                AgentId = owner.AgentId, SubAgentId = owner.SubAgentId,
                CustomerId = owner.CustomerId is { } c ? customerIds[c] : null,
                GuestEmail = isB2C && owner.CustomerId is null ? "guest@example.test" : null,
                Pnr = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), OfferId = "X", SupplierCode = "S",
                IdempotencyKey = Guid.NewGuid().ToString(), Status = BookingStatus.Pending, FinalPrice = 1, Currency = "USD",
            };
            pnrByName[name] = booking.Pnr;
            db.Bookings.Add(booking);
        }
        await db.SaveChangesAsync();

        // the customer callers must name the REAL customer ids
        Caller Real(Caller c) => c with
        {
            TenantId = tenant,
            CustomerId = c.CustomerId is { } cid ? customerIds[cid] : null,
            GuestBookingId = c.GuestBookingId is { } gid ? realId[gid] : null,
        };

        foreach (var (name, callerTemplate, expectedRead, expectedControl) in BookingAccessTests.Callers)
        {
            var caller = Real(callerTemplate);
            var visible = await db.Bookings.VisibleTo(caller).Select(b => b.Pnr).ToListAsync();
            var controlled = await db.Bookings.ControlledBy(caller).Select(b => b.Pnr).ToListAsync();

            Assert.Equal(expectedRead.Select(n => pnrByName[n]).Order(), visible.Order());
            Assert.Equal(expectedControl.Select(n => pnrByName[n]).Order(), controlled.Order());
            _ = name;
        }
    }

    [Fact]
    public async Task ABookingInAnotherTenant_IsInvisibleEvenToAPlatformAdmin()
    {
        var (tenantA, agentA, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var (tenantB, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        await TestData.SeedBookingAsync(fixture.Factory, tenantA, agentA);

        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantB);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var admin = new Caller(tenantB, "PLATFORM", null, ActorTypes.Agent);

        Assert.Empty(await db.Bookings.VisibleTo(admin).ToListAsync()); // the tenant filter wins before ownership is even asked
    }
}
