using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Search;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using BookingStatus = Ota.CoreEngine.Grpc.BookingStatus;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>The extracted application services (P1-1/P1-2) used directly — no gRPC channel, no token, no
/// ServerCallContext: just a Caller. This is what a second transport (or the B2C flow) will do, and what makes
/// their business rules testable without any transport in the way.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class ApplicationServiceTests(OtaCoreEngineFixture fixture)
{
    private static Caller AgentCaller(string tenantId, Guid agentId) => new(tenantId, "B2B_AGENT", agentId, "agent");

    private static B2BBookingRequest Booking(string offerId, string? key = null) => new()
    {
        OfferId = offerId, IdempotencyKey = key ?? $"key-{Guid.NewGuid()}", ContactEmail = "ops@test.example",
        Travelers = { new Traveler { FirstName = "T", LastName = "T", DocumentType = "PASSPORT", DocumentNumber = "P1" } },
    };

    private static async Task<ServiceException> FailureOf(Func<Task> call) => await Assert.ThrowsAsync<ServiceException>(call);

    [Fact]
    public async Task BookingService_TakesABookingFromReservationToTicket_WithNoTransportInvolved()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-service-direct");
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var bookings = scope.ServiceProvider.GetRequiredService<IBookingService>();
        var caller = AgentCaller(tenantId, agentId);

        var reserved = await bookings.ReserveAsync(caller, Booking("AMADEUS-service-direct"), default);
        var ticketed = await bookings.IssueTicketAsync(caller, new IssueTicketRequest { BookingId = reserved.BookingId }, default);

        Assert.Equal(BookingStatus.Pending, reserved.Status);
        Assert.Equal(BookingStatus.Confirmed, ticketed.Status);
    }

    [Fact]
    public async Task BookingService_ReportsBusinessFailuresAsServiceExceptions_NotTransportErrors()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var bookings = scope.ServiceProvider.GetRequiredService<IBookingService>();
        var caller = AgentCaller(tenantId, agentId);

        Assert.Equal(ErrorKind.InvalidArgument, (await FailureOf(() => bookings.ReserveAsync(caller, Booking("X", key: " "), default))).Kind);
        Assert.Equal(ErrorKind.InvalidArgument, (await FailureOf(() => bookings.ReserveAsync(caller with { AgentId = null }, Booking("X"), default))).Kind);
        // an offer nobody issued to this tenant
        var unknown = await FailureOf(() => bookings.ReserveAsync(caller, Booking("AMADEUS-never-searched"), default));
        Assert.Equal(ErrorKind.FailedPrecondition, unknown.Kind);
        Assert.Equal(ErrorMessages.OfferExpiredOrUnknown, unknown.Message);
        Assert.Equal(ErrorKind.NotFound, (await FailureOf(() => bookings.IssueTicketAsync(caller, new IssueTicketRequest { BookingId = Guid.NewGuid().ToString() }, default))).Kind);
        Assert.Equal(ErrorKind.InvalidArgument, (await FailureOf(() => bookings.IssueTicketAsync(caller, new IssueTicketRequest { BookingId = "not-a-guid" }, default))).Kind);
    }

    [Fact]
    public async Task SearchService_PricesAConsumerChannelCaller_WithTheTenantsB2CRule()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Standard, seedConsumerRule: true);
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var search = scope.ServiceProvider.GetRequiredService<ISearchService>();
        var anonymous = new Caller(tenantId, "B2C", null, "service");

        var response = await search.SearchAsync(anonymous, new SearchRequest
        { ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = "2026-12-15", Adults = 1 }, default);

        Assert.NotEmpty(response.Offers);
        Assert.All(response.Offers, o => Assert.Equal(0d, o.NetRate));   // a consumer is never shown our cost (P4-8)
        // The cost is visible only to a caller who may see it: price the same route as the tenant's own agent and apply the B2C rule to that.
        var costs = await search.SearchAsync(new Caller(tenantId, "B2B_AGENT", agentId, "agent"), new SearchRequest
        { ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = "2026-12-15", Adults = 1 }, default);
        Assert.Equal(costs.Offers.Select(o => Math.Round(o.NetRate * 1.06 + 10, 2)).Order(), response.Offers.Select(o => Math.Round(o.SellPrice, 2)).Order());
    }

    [Fact]
    public async Task SearchService_OneSupplierCall_PricesB2CAndB2BSeparately_AndDoesNotStealOwnership()
    {
        var (tenantA, agentA, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Gold, creditLimit: 5000m, markupPercent: 0.06m, subAgentDefaultMargin: 10m, seedConsumerRule: true);
        var (tenantB, agentB, _) = await TestData.SeedAgentAsync(fixture.Factory, tier: Domain.AgentTier.Gold, markupPercent: 0.20m, subAgentDefaultMargin: 0m);
        var day = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1500 + Random.Shared.Next(4000)).ToString("yyyy-MM-dd");
        var route = new SearchRequest { ProductType = ProductType.Flight, Origin = "DAC", Destination = "BKK", CheckIn = day, Adults = 1 };

        using var scopeA = TestData.CreateTenantScope(fixture.Factory, tenantA);
        var searchA = scopeA.ServiceProvider.GetRequiredService<ISearchService>();
        var bookingsA = scopeA.ServiceProvider.GetRequiredService<IBookingService>();
        var consumer = await searchA.SearchAsync(new Caller(tenantA, "B2C", null, "service"), route, default);
        var agent = await searchA.SearchAsync(AgentCaller(tenantA, agentA), route, default);

        using var scopeB = TestData.CreateTenantScope(fixture.Factory, tenantB);
        var searchB = scopeB.ServiceProvider.GetRequiredService<ISearchService>();
        var other = await searchB.SearchAsync(AgentCaller(tenantB, agentB), route, default);

        Assert.False(consumer.CacheHit);
        Assert.True(agent.CacheHit);
        Assert.True(other.CacheHit);
        Assert.Equal(consumer.SearchId, agent.SearchId);
        Assert.Equal(consumer.Offers.Select(o => o.OfferId), other.Offers.Select(o => o.OfferId));
        Assert.All(consumer.Offers, o => Assert.Equal(0d, o.NetRate));
        Assert.All(consumer.Offers, o => Assert.Equal("", o.SupplierCode));
        Assert.All(agent.Offers, o => Assert.True(o.NetRate > 0));
        Assert.NotEqual(agent.Offers.Select(o => o.SellPrice), other.Offers.Select(o => o.SellPrice));

        // Tenant B searching the same offers must not wipe tenant A's right to book them.
        var reserved = await bookingsA.ReserveAsync(AgentCaller(tenantA, agentA), Booking(agent.Offers[0].OfferId), default);
        Assert.Equal(BookingStatus.Pending, reserved.Status);
    }

    [Fact]
    public async Task SearchService_RefusesToRevalidateAnOfferTheCallersTenantWasNeverIssued()
    {
        var (tenantId, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var search = scope.ServiceProvider.GetRequiredService<ISearchService>();

        var result = await search.RevalidateAsync(AgentCaller(tenantId, agentId),
            new RevalidateRequest { OfferId = "AMADEUS-not-mine", ExpectedNetRate = 220 }, default);

        Assert.False(result.Matches);
        Assert.Equal(ErrorMessages.OfferExpiredOrUnknown, result.FailureReason);
    }

    [Fact]
    public async Task AnIdempotencyKey_ReplaysOnlyForTheAgentWhoMadeTheBooking()
    {
        var (tenantId, agentA, _) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        var (agentB, _) = await TestData.SeedAgentUserAsync(fixture.Factory, tenantId, Domain.UserRole.AgencyAdmin, creditLimit: 5000m);
        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-idem-owner");
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        var bookings = scope.ServiceProvider.GetRequiredService<IBookingService>();
        var key = $"key-{Guid.NewGuid()}";

        var original = await bookings.ReserveAsync(AgentCaller(tenantId, agentA), Booking("AMADEUS-idem-owner", key), default);
        var replay = await bookings.ReserveAsync(AgentCaller(tenantId, agentA), Booking("AMADEUS-idem-owner", key), default);
        // another agency in the same tenant reuses (or guesses) the key: it must not be handed A's booking
        var other = await FailureOf(() => bookings.ReserveAsync(AgentCaller(tenantId, agentB), Booking("AMADEUS-idem-owner", key), default));

        Assert.Equal(original.BookingId, replay.BookingId);
        Assert.Equal(ErrorKind.FailedPrecondition, other.Kind);
        Assert.DoesNotContain(original.Pnr, other.Message);
        Assert.DoesNotContain(original.BookingId, other.Message);
    }
}
