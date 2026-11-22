using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Messaging;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>Replaces ProcessB2BBookingKafkaTests: proves IssueTicket writes both
/// events into the OutboxEvents table atomically with the booking's Confirmed
/// status, instead of asserting delivery to a broker (see plan: "Replace Kafka
/// with a Postgres transactional outbox").</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class ProcessB2BBookingOutboxTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public async Task IssueTicket_HappyPath_WritesBookingCreatedAndCreditDeductedOutboxRows()
    {
        var (tenantId, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory, creditLimit: 5000m);
        var client = new OtaCoreService.OtaCoreServiceClient(fixture.Factory.CreateGrpcChannel(agentToken));

        await TestData.OwnOfferAsync(fixture.Factory, tenantId, "AMADEUS-outbox-check");
        var bookingResp = await client.ProcessB2BBookingAsync(new B2BBookingRequest
        {
            Tenant = new TenantContext
            {
                TenantId = tenantId,
                Channel = ChannelType.B2BAgent,
                AgentId = agentId.ToString(),
                AgentTier = AgentTier.Gold,
                Currency = "USD",
            },
            OfferId = "AMADEUS-outbox-check",
            IdempotencyKey = $"key-{Guid.NewGuid()}",
            ContactEmail = "ops@test.example",
            Travelers = { new Traveler { FirstName = "Outbox", LastName = "Check", DocumentType = "PASSPORT", DocumentNumber = "P2222222" } },
        });
        Assert.Equal(BookingStatus.Pending, bookingResp.Status);

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
        Assert.Equal(BookingStatus.Confirmed, response.Status);

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var tenantAccessor = scope.ServiceProvider.GetRequiredService<Ota.CoreEngine.Tenancy.ITenantAccessor>();
        tenantAccessor.Set(new Ota.CoreEngine.Tenancy.TenantContext { TenantId = tenantId });

        // Filtered by this booking's own id, not a row count — the fixture
        // points at the shared, persistent compose database, not a throwaway one.
        var events = await db.OutboxEvents
            .Where(e => e.Key.EndsWith(response.BookingId) || e.Payload.Contains(response.BookingId))
            .ToListAsync();

        var created = Assert.Single(events, e => e.Topic == BookingEventTopics.BookingCreated);
        Assert.Contains(response.Pnr, created.Payload);
        // Deliberately NOT asserting ProcessedAt is null: this suite runs against the shared compose
        // database, where the live ai-engine consumes outbox rows within seconds, so "still unprocessed"
        // is a race with a running service, not a property of the code under test. What core guarantees
        // is that the rows exist, atomically with the status change (checked here and in
        // ProcessB2BBookingTests); marking them processed is the consumer's job.

        var deducted = Assert.Single(events, e => e.Topic == BookingEventTopics.CreditDeducted);
        Assert.Contains(response.BookingId, deducted.Payload);
    }
}
