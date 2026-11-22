using Grpc.Core;
using Grpc.Core.Interceptors;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Grpc;

/// <summary>Translates the application services' transport-neutral <see cref="ServiceException"/> into gRPC
/// status codes — the only place that knows the mapping. Registered inside AlertingInterceptor, so what that
/// sees is an RpcException (an expected business outcome, never paged).</summary>
public sealed class ServiceExceptionInterceptor : Interceptor
{
    public override async Task<TResponse> UnaryServerHandler<TRequest, TResponse>(
        TRequest request, ServerCallContext context, UnaryServerMethod<TRequest, TResponse> continuation)
    {
        try
        {
            return await continuation(request, context);
        }
        catch (ServiceException ex)
        {
            throw new RpcException(new Status(ex.Kind switch
            {
                ErrorKind.InvalidArgument => StatusCode.InvalidArgument,
                ErrorKind.NotFound => StatusCode.NotFound,
                ErrorKind.FailedPrecondition => StatusCode.FailedPrecondition,
                ErrorKind.PermissionDenied => StatusCode.PermissionDenied,
                _ => StatusCode.Unknown,
            }, ex.Message));
        }
    }
}
