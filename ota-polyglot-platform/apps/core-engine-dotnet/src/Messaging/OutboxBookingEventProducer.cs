using System.Text.Json;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Messaging;

public sealed record BookingCreatedEvent(
    string BookingId,
    string TenantId,
    string Channel,
    string? AgentId,
    string? SubAgentId,
    string Pnr,
    string OfferId,
    decimal FinalPrice,
    string Currency,
    DateTimeOffset CreatedAt);

public sealed record AgentCreditDeductedEvent(
    string TenantId,
    string AgentId,
    string BookingId,
    decimal Amount,
    decimal BalanceAfter,
    DateTimeOffset OccurredAt);

public static class BookingEventTopics
{
    public const string BookingCreated = "booking-created";
    public const string CreditDeducted = "agent-credit-deducted";
}

public interface IBookingEventProducer
{
    Task PublishBookingCreatedAsync(BookingCreatedEvent evt, CancellationToken ct);
    Task PublishCreditDeductedAsync(AgentCreditDeductedEvent evt, CancellationToken ct);
}

/// <summary>
/// Transactional-outbox implementation: stages an OutboxEvent row on the
/// ambient (request-scoped) OtaDbContext rather than calling out to a broker.
/// The caller is expected to include this in the same SaveChangesAsync as the
/// domain change it announces — see OtaCoreGrpcService.IssueTicket — so the
/// event can never be lost after that change commits, without a separate
/// message broker to run or pay for. ai-engine-python drains this table via
/// polling + LISTEN/NOTIFY (see the AddOutboxEvents migration).
///
/// Registered AddScoped (not AddSingleton) specifically so it shares the same
/// OtaDbContext instance as the gRPC call that constructed it.
/// </summary>
public sealed class OutboxBookingEventProducer(OtaDbContext db) : IBookingEventProducer
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public Task PublishBookingCreatedAsync(BookingCreatedEvent evt, CancellationToken ct) =>
        Enqueue(BookingEventTopics.BookingCreated, $"{evt.TenantId}:{evt.BookingId}", evt.TenantId, evt);

    public Task PublishCreditDeductedAsync(AgentCreditDeductedEvent evt, CancellationToken ct) =>
        Enqueue(BookingEventTopics.CreditDeducted, $"{evt.TenantId}:{evt.AgentId}", evt.TenantId, evt);

    private Task Enqueue<T>(string topic, string key, string tenantId, T payload)
    {
        db.OutboxEvents.Add(new OutboxEvent
        {
            TenantId = tenantId,
            Topic = topic,
            Key = key,
            Payload = JsonSerializer.Serialize(payload, JsonOpts),
        });
        return Task.CompletedTask;
    }
}
