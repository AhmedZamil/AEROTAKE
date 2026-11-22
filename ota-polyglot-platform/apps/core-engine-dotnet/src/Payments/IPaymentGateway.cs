using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Payments;

public sealed record StartPaymentRequest(Guid BookingId, string? IdempotencyKey, string Method = "sslcommerz");
public sealed record StartPaymentResult(Guid PaymentId, string TranId, string? GatewayPageUrl, bool Replayed, string Method = "sslcommerz", bool Paid = false, string? BookingStatus = null);

public sealed record GatewayInitRequest(
    string TranId,
    decimal Amount,
    string Currency,
    string SuccessUrl,
    string FailUrl,
    string CancelUrl,
    string IpnUrl,
    string CustomerName,
    string CustomerEmail,
    string CustomerPhone,
    string ProductName);

public sealed record GatewayInitResult(string SessionKey, string GatewayPageUrl);

public sealed record GatewayValidationRequest(string ValId);
public sealed record GatewayValidationResult(
    bool Ok,
    string Status,
    string TranId,
    decimal Amount,
    string Currency,
    string? GatewayRef,
    string RawJson);

public sealed record GatewayRefundRequest(
    string BankTranId,
    string RefundTranId,
    decimal Amount,
    string Remarks);

public sealed record GatewayRefundResult(bool Ok, string Status, string? GatewayRef, string? ErrorReason, string RawJson);

/// <summary>Hosted checkout adapter — SSLCommerz first; bKash later behind the same interface (P4-12).</summary>
public interface IPaymentGateway
{
    string Name { get; }
    Task<GatewayInitResult> InitiateAsync(GatewayInitRequest request, CancellationToken ct);
    Task<GatewayValidationResult> ValidateAsync(GatewayValidationRequest request, CancellationToken ct);
    Task<GatewayRefundResult> RefundAsync(GatewayRefundRequest request, CancellationToken ct);
}

public interface IPaymentService
{
    Task<StartPaymentResult> StartAsync(Caller caller, StartPaymentRequest request, CancellationToken ct);
}
