namespace Ota.CoreEngine.SharedKernel;

/// <summary>Who is making a request, as established by the transport from a validated credential (see
/// GrpcCallerResolver). Application services take this and nothing about how it arrived, so the same
/// service can sit behind gRPC today and another transport later.</summary>
/// <param name="TenantId">The tenant whose data the call may touch.</param>
/// <param name="Channel">Sales channel (B2C, B2B_AGENT, B2B_SUB_AGENT, WHITE_LABEL, PLATFORM).</param>
/// <param name="AgentId">The agent acting, or the agent a service is pricing for; null for none.</param>
/// <param name="ActorType">agent | service | customer | guest (see <see cref="ActorTypes"/>).</param>
/// <param name="CustomerId">The signed-in consumer, for a customer caller; null otherwise.</param>
/// <param name="GuestBookingId">The one booking a guest has proven access to (by an emailed claim token or by reference and
/// surname); null for everyone else. A guest can reach that booking and nothing else.</param>
public sealed record Caller(string TenantId, string Channel, Guid? AgentId, string ActorType, Guid? CustomerId = null, Guid? GuestBookingId = null)
{
    /// <summary>A platform administrator: an agent-type user with no agency (the token's channel is PLATFORM).</summary>
    public bool IsPlatformAdmin => ActorType == ActorTypes.Agent && Channel == BookingAccess.PlatformChannel;
}
