using Grpc.Core;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tenancy;
using GrpcContract = Ota.CoreEngine.Grpc;

namespace Ota.CoreEngine.Grpc;

/// <summary>Turns a validated gRPC credential into a <see cref="Caller"/> — the transport's half of
/// authentication. Who the caller is comes from the token, never from the request message: for a logged-in
/// agent a tenant or agent in the message may repeat what the token says but a contradiction is rejected, and
/// the message's channel and tier are ignored. Only a frontend service acting for an anonymous visitor asserts
/// the tenant/channel, and only inside the allow-list of its service credential.
/// It also mirrors the caller into the scoped tenant accessor so EF's global query filters apply exactly as
/// they do for REST traffic.</summary>
public interface IGrpcCallerResolver
{
    Caller Resolve(GrpcContract.TenantContext? message, ServerCallContext context);
}

public sealed class GrpcCallerResolver(ITenantAccessor tenantAccessor) : IGrpcCallerResolver
{
    public Caller Resolve(GrpcContract.TenantContext? message, ServerCallContext context)
    {
        var user = context.GetHttpContext().User;
        var actor = user.FindFirst(ActorTypes.ClaimName)?.Value;
        var claimedTenant = message?.TenantId ?? "";
        var claimedAgent = message?.AgentId ?? "";

        Caller caller;
        if (actor == ActorTypes.Agent)
        {
            var tenantId = user.FindFirst("tenant_id")?.Value;
            var channel = user.FindFirst(TenantResolutionMiddleware.ChannelClaim)?.Value;
            if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(channel))
                throw new RpcException(new Status(StatusCode.Unauthenticated, "Token is missing tenant or channel claims."));

            // Fields in the message are legacy: they may repeat what the token says, never contradict it.
            if (claimedTenant.Length > 0 && claimedTenant != tenantId)
                throw new RpcException(new Status(StatusCode.PermissionDenied, "tenant.tenant_id does not match the caller's token."));

            Guid? agentId = Guid.TryParse(user.FindFirst("agent_id")?.Value, out var a) ? a : null;
            if (claimedAgent.Length > 0 && !(agentId is { } own && Guid.TryParse(claimedAgent, out var claimed) && claimed == own))
                throw new RpcException(new Status(StatusCode.PermissionDenied, "tenant.agent_id does not match the caller's token."));

            caller = new Caller(tenantId, channel, agentId, actor);
        }
        else if (actor == ActorTypes.Service)
        {
            // A frontend acting for an anonymous visitor has no user token, so it asserts the tenant (resolved from
            // the host) — but only inside what its credential allows.
            if (string.IsNullOrWhiteSpace(claimedTenant))
                throw new RpcException(new Status(StatusCode.InvalidArgument, "tenant.tenant_id is required."));

            var tenants = (user.FindFirst("tenants")?.Value ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (!tenants.Contains(ServiceClient.AnyTenant) && !tenants.Contains(claimedTenant))
                throw new RpcException(new Status(StatusCode.PermissionDenied, "This service is not allowed to act for that tenant."));

            var channel = ChannelName(message!.Channel);
            var channels = (user.FindFirst("channels")?.Value ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (channel.Length == 0 || !channels.Contains(channel))
                throw new RpcException(new Status(StatusCode.PermissionDenied, "This service is not allowed to act for that channel."));

            // Pricing context only (e.g. a white-label domain trades as its agent); it is looked up under the
            // tenant filter, so an id from another tenant simply isn't found. Never used to book.
            Guid? agentId = null;
            if (claimedAgent.Length > 0)
            {
                if (!Guid.TryParse(claimedAgent, out var parsed))
                    throw new RpcException(new Status(StatusCode.InvalidArgument, "tenant.agent_id is not a valid GUID."));
                agentId = parsed;
            }
            caller = new Caller(claimedTenant, channel, agentId, actor);
        }
        else
        {
            throw new RpcException(new Status(StatusCode.Unauthenticated, "Authentication required."));
        }

        // Fully named: inside this namespace a bare TenantContext is the proto message of the same name.
        tenantAccessor.Set(new Tenancy.TenantContext
        {
            TenantId = caller.TenantId, Channel = caller.Channel, AgentId = caller.AgentId, ActorType = caller.ActorType,
        });
        return caller;
    }

    /// <summary>The domain/registry spelling of a proto channel; "" when unspecified.</summary>
    private static string ChannelName(GrpcContract.ChannelType channel) => channel switch
    {
        GrpcContract.ChannelType.B2C => "B2C",
        GrpcContract.ChannelType.B2BAgent => "B2B_AGENT",
        GrpcContract.ChannelType.B2BSubAgent => "B2B_SUB_AGENT",
        GrpcContract.ChannelType.WhiteLabel => "WHITE_LABEL",
        _ => "",
    };
}
