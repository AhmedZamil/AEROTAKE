namespace Ota.CoreEngine.SharedKernel;

/// <summary>What kind of business failure a service is reporting. Transport-neutral on purpose: the gRPC layer
/// maps these to status codes (ServiceExceptionInterceptor), and a REST layer would map them to HTTP.</summary>
public enum ErrorKind
{
    InvalidArgument,
    NotFound,
    FailedPrecondition,
    PermissionDenied,
}

/// <summary>An expected business outcome (offer expired, agent not found, ...), not a fault. Application
/// services throw this instead of a transport exception so they never depend on the transport.</summary>
public sealed class ServiceException(ErrorKind kind, string message, string? code = null) : Exception(message)
{
    public ErrorKind Kind { get; } = kind;
    /// <summary>Stable machine code for the client (for example <c>payment_retry_required</c>). The message stays customer-facing.</summary>
    public string? Code { get; } = code;
}

/// <summary>Messages more than one service must word identically.</summary>
public static class ErrorMessages
{
    /// <summary>Also used for an offer that belongs to another tenant, so its existence isn't revealed.</summary>
    public const string OfferExpiredOrUnknown = "Offer expired or unknown. Please search again.";
}
