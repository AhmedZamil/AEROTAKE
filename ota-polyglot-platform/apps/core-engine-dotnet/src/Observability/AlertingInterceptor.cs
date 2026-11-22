using Grpc.Core;
using Grpc.Core.Interceptors;

namespace Ota.CoreEngine.Observability;

/// <summary>
/// Alerts on genuinely unhandled exceptions from gRPC handlers. RpcException
/// is deliberately excluded — it's how OtaCoreGrpcService signals expected
/// business outcomes (agent not found, offer expired, missing tenant), not a
/// fault worth paging anyone for.
/// </summary>
public sealed class AlertingInterceptor(IAlertNotifier notifier, ILogger<AlertingInterceptor> logger) : Interceptor
{
    public override async Task<TResponse> UnaryServerHandler<TRequest, TResponse>(
        TRequest request, ServerCallContext context, UnaryServerMethod<TRequest, TResponse> continuation)
    {
        try
        {
            return await continuation(request, context);
        }
        catch (RpcException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception in gRPC method {Method}", context.Method);
            await notifier.NotifyAsync($"Unhandled exception in {context.Method}", ex,
                new Dictionary<string, string> { ["method"] = context.Method });
            throw;
        }
    }
}
