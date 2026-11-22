using Grpc.Core;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.SharedKernel;
using Xunit;

namespace Ota.CoreEngine.Tests.Unit;

/// <summary>The one place a business failure becomes a gRPC status code.</summary>
public class ServiceExceptionInterceptorTests
{
    [Theory]
    [InlineData(ErrorKind.InvalidArgument, StatusCode.InvalidArgument)]
    [InlineData(ErrorKind.NotFound, StatusCode.NotFound)]
    [InlineData(ErrorKind.FailedPrecondition, StatusCode.FailedPrecondition)]
    [InlineData(ErrorKind.PermissionDenied, StatusCode.PermissionDenied)]
    public async Task AServiceException_BecomesTheMatchingStatus_KeepingItsMessage(ErrorKind kind, StatusCode expected)
    {
        var interceptor = new ServiceExceptionInterceptor();

        var ex = await Assert.ThrowsAsync<RpcException>(() => interceptor.UnaryServerHandler<string, string>(
            "req", null!, (_, _) => throw new ServiceException(kind, "the business reason")));

        Assert.Equal(expected, ex.StatusCode);
        Assert.Equal("the business reason", ex.Status.Detail);
    }

    [Fact]
    public async Task AnythingElse_IsLeftAlone_ForTheAlertingInterceptorToSee()
    {
        var interceptor = new ServiceExceptionInterceptor();

        await Assert.ThrowsAsync<InvalidOperationException>(() => interceptor.UnaryServerHandler<string, string>(
            "req", null!, (_, _) => throw new InvalidOperationException("a real fault")));
    }

    [Fact]
    public async Task ASuccessfulCall_PassesThrough()
    {
        var response = await new ServiceExceptionInterceptor().UnaryServerHandler<string, string>("req", null!, (r, _) => Task.FromResult(r + "!"));

        Assert.Equal("req!", response);
    }
}
