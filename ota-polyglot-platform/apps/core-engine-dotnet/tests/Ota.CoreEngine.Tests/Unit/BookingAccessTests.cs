using System.Security.Claims;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.SharedKernel;
using Xunit;

namespace Ota.CoreEngine.Tests.Unit;

/// <summary>P2-7: who may see and who may act on a booking — the whole rule as one table. The same table is replayed
/// against the SQL form (BookingOwnershipQueryTests) and against the older REST check below, so the three cannot drift.</summary>
public class BookingAccessTests
{
    public static readonly Guid AgentA = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    public static readonly Guid AgentB = Guid.Parse("bbbbbbbb-0000-0000-0000-000000000002");
    public static readonly Guid SubAgentS = Guid.Parse("55555555-0000-0000-0000-000000000005");
    public static readonly Guid Customer1 = Guid.Parse("c1c1c1c1-0000-0000-0000-000000000001");
    public static readonly Guid Customer2 = Guid.Parse("c2c2c2c2-0000-0000-0000-000000000002");

    public static readonly Guid GuestBooking = Guid.Parse("99999999-0000-0000-0000-000000000009");

    /// <summary>The kinds of booking that exist (each with its own id, which a guest's grant names).</summary>
    public static readonly (string Name, BookingOwner Owner)[] Bookings =
    [
        ("B2B by A",            new(AgentA, null, null, Guid.Parse("b0000000-0000-0000-0000-000000000001"))),
        ("B2B by A for sub S",  new(AgentA, SubAgentS, null, Guid.Parse("b0000000-0000-0000-0000-000000000002"))),
        ("B2B by B",            new(AgentB, null, null, Guid.Parse("b0000000-0000-0000-0000-000000000003"))),
        ("B2C of customer 1",   new(null, null, Customer1, Guid.Parse("b0000000-0000-0000-0000-000000000004"))),
        ("B2C of customer 2",   new(null, null, Customer2, Guid.Parse("b0000000-0000-0000-0000-000000000005"))),
        ("B2C guest",           new(null, null, null, GuestBooking)),
    ];

    /// <summary>Every kind of caller, and exactly which bookings each may READ and may CONTROL.</summary>
    public static readonly (string Name, Caller Caller, string[] Read, string[] Control)[] Callers =
    [
        ("agent A",        new("t", "B2B_AGENT", AgentA, ActorTypes.Agent),
            ["B2B by A", "B2B by A for sub S"], ["B2B by A", "B2B by A for sub S"]),
        ("agent B",        new("t", "B2B_AGENT", AgentB, ActorTypes.Agent),
            ["B2B by B"], ["B2B by B"]),
        ("sub-agent S",    new("t", "B2B_SUB_AGENT", SubAgentS, ActorTypes.Agent),
            ["B2B by A for sub S"], []),                       // sees a booking made for them, cannot ticket it
        ("platform admin", new("t", "PLATFORM", null, ActorTypes.Agent),
            ["B2B by A", "B2B by A for sub S", "B2B by B", "B2C of customer 1", "B2C of customer 2", "B2C guest"], []),
        ("customer 1",     new("t", "B2C", null, ActorTypes.Customer, Customer1),
            ["B2C of customer 1"], ["B2C of customer 1"]),
        ("customer 2",     new("t", "B2C", null, ActorTypes.Customer, Customer2),
            ["B2C of customer 2"], ["B2C of customer 2"]),
        ("guest with a grant", new("t", "B2C", null, ActorTypes.Guest, GuestBookingId: GuestBooking),
            ["B2C guest"], ["B2C guest"]),                     // P5-20: may cancel the one booking they proved access to
        ("guest granted a different booking", new("t", "B2C", null, ActorTypes.Guest, GuestBookingId: Guid.Parse("b0000000-0000-0000-0000-000000000004")),
            ["B2C of customer 1"], ["B2C of customer 1"]),     // a grant is for exactly one booking, whoever owns it
        ("guest with no grant",     new("t", "B2C", null, ActorTypes.Guest),
            [], []),                                           // identity alone opens nothing
        ("service",        new("t", "B2C", AgentA, ActorTypes.Service),
            [], []),                                           // a frontend's service credential never owns anything, even naming an agent
        ("agent with no agency", new("t", "B2B_AGENT", null, ActorTypes.Agent),
            [], []),
        ("customer with no id",   new("t", "B2C", null, ActorTypes.Customer),
            [], []),
    ];

    public static IEnumerable<object[]> CallerNames => Callers.Select(c => new object[] { c.Name });

    [Theory]
    [MemberData(nameof(CallerNames))]
    public void EachCaller_MaySeeExactlyTheirBookings(string name)
    {
        var (_, caller, expectedRead, _) = Callers.Single(c => c.Name == name);

        var seen = Bookings.Where(b => BookingAccess.CanRead(caller, b.Owner)).Select(b => b.Name).ToArray();

        Assert.Equal(expectedRead.Order(), seen.Order());
    }

    [Theory]
    [MemberData(nameof(CallerNames))]
    public void EachCaller_MayActOnExactlyTheirBookings(string name)
    {
        var (_, caller, _, expectedControl) = Callers.Single(c => c.Name == name);

        var acted = Bookings.Where(b => BookingAccess.CanControl(caller, b.Owner)).Select(b => b.Name).ToArray();

        Assert.Equal(expectedControl.Order(), acted.Order());
    }

    [Fact]
    public void ControllingABookingAlwaysImpliesBeingAbleToSeeIt()
    {
        foreach (var (_, caller, _, _) in Callers)
            foreach (var (_, owner) in Bookings)
                if (BookingAccess.CanControl(caller, owner)) Assert.True(BookingAccess.CanRead(caller, owner));
    }

    /// <summary>The REST controllers still use ClaimsPrincipal.CanAccessBooking (B1). For the callers both can express — agents and
    /// platform admins — it must give the same answer as the service-layer rule.</summary>
    [Fact]
    public void TheRestControllersCheck_AgreesWithTheServiceRule()
    {
        ClaimsPrincipal Principal(string role, Guid? agent) => new(new ClaimsIdentity(
            new[] { new Claim(ClaimTypes.Role, role) }.Concat(agent is { } a ? [new Claim("agent_id", a.ToString())] : []), "test"));

        var pairs = new (string Caller, ClaimsPrincipal Identity)[]
        {
            ("agent A", Principal("AgencyAdmin", AgentA)),
            ("agent B", Principal("AgencyUser", AgentB)),
            ("sub-agent S", Principal("AgencyUser", SubAgentS)),
            ("platform admin", Principal("Admin", null)),
        };

        foreach (var (name, identity) in pairs)
        {
            var caller = Callers.Single(c => c.Name == name).Caller;
            foreach (var (bookingName, owner) in Bookings)
                Assert.True(identity.CanAccessBooking(owner.AgentId, owner.SubAgentId) == BookingAccess.CanRead(caller, owner),
                    $"{name} on '{bookingName}': REST and service rule disagree");
        }
    }
}
