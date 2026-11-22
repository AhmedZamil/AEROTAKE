using Grpc.Core;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

[Collection(OtaCoreEngineCollection.Name)]
public class ProcessB2BBookingTests(OtaCoreEngineFixture fixture)
{
    private static B2BBookingRequest BookingRequest(string tenantId, Guid agentId, string offerId, string idempotencyKey) => new()
    {
        Tenant = new TenantContext
        {
            TenantId = tenantId,
            Channel = ChannelType.B2BAgent,
            AgentId = agentId.ToString(),
            AgentTier = AgentTier.Gold,
            Currency = "USD",
        },
        OfferId = offerId,
        IdempotencyKey = idempotencyKey,
        ContactEmail = "ops@test.example",
        Travelers = { new Traveler { FirstName = "Test", LastName = "Traveler", DocumentType = "PASSPORT", DocumentNumber = "P0000000" } },
    };

    [Fact]
    public async Task ProcessB2BBooking_HappyPath_ConfirmsAndDebitsCredit()
    {
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m, markupPercent: 0.06m, subAgentDefaultMargin: 10m);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-happy-path");
        var response = await client.ProcessB2BBookingAsync(
            BookingRequest(tenantId, agentId, "AMADEUS-happy-path", $"key-{Guid.NewGuid()}"));

        Assert.Equal(BookingStatus.Pending, response.Status);
        // SupplierStub.NetRateForOffer("AMADEUS-...") = 220; 220 * 1.06 + 10 = 243.20
        Assert.Equal(243.20, response.Price.FinalPrice, precision: 2);

        // Now issue the ticket to complete the booking and debit the credit
        var ticketResponse = await client.IssueTicketAsync(new IssueTicketRequest
        {
            Tenant = new TenantContext
            {
                TenantId = tenantId,
                Channel = ChannelType.B2BAgent,
                AgentId = agentId.ToString(),
                AgentTier = AgentTier.Gold,
            },
            BookingId = response.BookingId,
        });

        Assert.Equal(BookingStatus.Confirmed, ticketResponse.Status);
        Assert.Equal(4756.80, ticketResponse.AgentBalanceAfter, precision: 2);
        Assert.False(fixture.AlertNotifier.Calls.Any(c => c.Title.Contains(response.Pnr)));
    }

    [Fact]
    public async Task ProcessB2BBooking_InsufficientCredit_RejectsWithoutAlerting()
    {
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 1m);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));
        fixture.AlertNotifier.Clear();

        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-insufficient");
        var bookingResp = await client.ProcessB2BBookingAsync(
            BookingRequest(tenantId, agentId, "AMADEUS-insufficient", $"key-{Guid.NewGuid()}"));

        // ProcessB2BBooking reserves with supplier but doesn't charge yet
        Assert.Equal(BookingStatus.Pending, bookingResp.Status);

        // IssueTicket is where the credit check happens
        var response = await client.IssueTicketAsync(new IssueTicketRequest
        {
            Tenant = new TenantContext
            {
                TenantId = tenantId,
                Channel = ChannelType.B2BAgent,
                AgentId = agentId.ToString(),
                AgentTier = AgentTier.Gold,
            },
            BookingId = bookingResp.BookingId,
        });

        // Expected business outcome, not a fault — must not page anyone.
        Assert.Equal(BookingStatus.RejectedCredit, response.Status);
        Assert.NotEmpty(response.FailureReason);
        Assert.Empty(fixture.AlertNotifier.Calls);
    }

    [Fact]
    public async Task ProcessB2BBooking_IdempotentReplay_ReturnsOriginalConfirmationWithoutDoubleDebit()
    {
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));
        var idempotencyKey = $"key-{Guid.NewGuid()}";
        var tenantCtx = new TenantContext
        {
            TenantId = tenantId,
            Channel = ChannelType.B2BAgent,
            AgentId = agentId.ToString(),
            AgentTier = AgentTier.Gold,
            Currency = "USD",
        };

        // First booking: ProcessB2BBooking -> IssueTicket
        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "SABRE-replay");
        var first = await client.ProcessB2BBookingAsync(BookingRequest(tenantId, agentId, "SABRE-replay", idempotencyKey));
        var firstTicket = await client.IssueTicketAsync(new IssueTicketRequest
        {
            Tenant = tenantCtx,
            BookingId = first.BookingId,
        });

        // Replay: both calls should return the same booking/confirmation
        var second = await client.ProcessB2BBookingAsync(BookingRequest(tenantId, agentId, "SABRE-replay", idempotencyKey));
        var secondTicket = await client.IssueTicketAsync(new IssueTicketRequest
        {
            Tenant = tenantCtx,
            BookingId = second.BookingId,
        });

        Assert.Equal(first.BookingId, second.BookingId);
        Assert.Equal(first.Pnr, second.Pnr);
        Assert.Equal(firstTicket.Pnr, secondTicket.Pnr);
        Assert.Equal(BookingStatus.Confirmed, secondTicket.Status);

        var ledger = await TestData.LedgerForAsync(fixture.Factory, agentId);
        Assert.Single(ledger); // exactly one debit, not two
    }

    [Fact]
    public async Task ProcessB2BBooking_NoTenantHeaderOnGrpcCall_StillSucceeds()
    {
        // Regression test: TenantResolutionMiddleware must not intercept gRPC
        // calls demanding an X-Tenant-ID HTTP header — gRPC carries tenant
        // inside the message itself (see RequireTenant in OtaCoreGrpcService).
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "HOTELBEDS-no-header");
        var response = await client.ProcessB2BBookingAsync(
            BookingRequest(tenantId, agentId, "HOTELBEDS-no-header", $"key-{Guid.NewGuid()}"));

        // ProcessB2BBooking returns Pending (no immediate confirmation)
        Assert.Equal(BookingStatus.Pending, response.Status);

        // IssueTicket can follow without any HTTP header issues
        var ticketResponse = await client.IssueTicketAsync(new IssueTicketRequest
        {
            Tenant = new TenantContext
            {
                TenantId = tenantId,
                Channel = ChannelType.B2BAgent,
                AgentId = agentId.ToString(),
                AgentTier = AgentTier.Gold,
            },
            BookingId = response.BookingId,
        });

        Assert.Equal(BookingStatus.Confirmed, ticketResponse.Status);
    }
}
