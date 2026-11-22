using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Payments;

public sealed class SslCommerzOptions
{
    public const string Section = "SslCommerz";

    public string StoreId { get; set; } = "";
    public string StorePassword { get; set; } = "";
    /// <summary>When true, use sandbox.sslcommerz.com; otherwise securepay.sslcommerz.com.</summary>
    public bool IsSandbox { get; set; } = true;
    /// <summary>Public origin of the B2C storefront (browser return URLs). Falls back to STOREFRONT_PUBLIC_URL.</summary>
    public string? StorefrontPublicUrl { get; set; }
    /// <summary>Public origin of core (IPN URL). Localhost only works if SSLCommerz can reach it (usually needs a tunnel).</summary>
    public string? CorePublicUrl { get; set; }
}

/// <summary>SSLCommerz hosted checkout (v4 init + order validation). Card data never touches our servers.</summary>
public sealed class SslCommerzGateway(IHttpClientFactory httpClients, IOptions<SslCommerzOptions> options) : IPaymentGateway
{
    public string Name => PaymentGateways.SslCommerz;

    private SslCommerzOptions Opt => options.Value;
    private string BaseHost => Opt.IsSandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";

    public async Task<GatewayInitResult> InitiateAsync(GatewayInitRequest request, CancellationToken ct)
    {
        EnsureConfigured();
        var form = new Dictionary<string, string>
        {
            ["store_id"] = Opt.StoreId,
            ["store_passwd"] = Opt.StorePassword,
            ["total_amount"] = request.Amount.ToString("0.00", CultureInfo.InvariantCulture),
            ["currency"] = request.Currency,
            ["tran_id"] = request.TranId,
            ["success_url"] = request.SuccessUrl,
            ["fail_url"] = request.FailUrl,
            ["cancel_url"] = request.CancelUrl,
            ["ipn_url"] = request.IpnUrl,
            ["cus_name"] = Truncate(request.CustomerName, 50),
            ["cus_email"] = Truncate(request.CustomerEmail, 50),
            ["cus_phone"] = Truncate(string.IsNullOrWhiteSpace(request.CustomerPhone) ? "01700000000" : request.CustomerPhone, 20),
            ["cus_add1"] = "N/A",
            ["cus_city"] = "Dhaka",
            ["cus_country"] = "Bangladesh",
            ["shipping_method"] = "NO",
            ["product_name"] = Truncate(request.ProductName, 50),
            ["product_category"] = "flight",
            ["product_profile"] = "general",
        };

        using var content = new FormUrlEncodedContent(form);
        var client = httpClients.CreateClient("sslcommerz");
        using var response = await client.PostAsync($"{BaseHost}/gwprocess/v4/api.php", content, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
        var root = doc.RootElement;
        var status = root.TryGetProperty("status", out var s) ? s.GetString() : null;
        if (!string.Equals(status, "SUCCESS", StringComparison.OrdinalIgnoreCase))
        {
            var reason = root.TryGetProperty("failedreason", out var fr) ? fr.GetString() : raw;
            throw new SharedKernel.ServiceException(SharedKernel.ErrorKind.FailedPrecondition,
                $"Payment gateway could not start the session{(string.IsNullOrWhiteSpace(reason) ? "" : $": {reason}")}.");
        }

        var sessionKey = root.GetProperty("sessionkey").GetString()
            ?? throw new SharedKernel.ServiceException(SharedKernel.ErrorKind.FailedPrecondition, "Payment gateway returned no session key.");
        var pageUrl = root.GetProperty("GatewayPageURL").GetString()
            ?? throw new SharedKernel.ServiceException(SharedKernel.ErrorKind.FailedPrecondition, "Payment gateway returned no checkout URL.");
        return new GatewayInitResult(sessionKey, pageUrl);
    }

    public async Task<GatewayValidationResult> ValidateAsync(GatewayValidationRequest request, CancellationToken ct)
    {
        EnsureConfigured();
        if (string.IsNullOrWhiteSpace(request.ValId))
            return new GatewayValidationResult(false, "MISSING", "", 0m, "", null, "{}");

        var url =
            $"{BaseHost}/validator/api/validationserverAPI.php?val_id={Uri.EscapeDataString(request.ValId)}" +
            $"&store_id={Uri.EscapeDataString(Opt.StoreId)}&store_passwd={Uri.EscapeDataString(Opt.StorePassword)}&v=1&format=json";
        var client = httpClients.CreateClient("sslcommerz");
        using var response = await client.GetAsync(url, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
        var root = doc.RootElement;
        var status = root.TryGetProperty("status", out var st) ? st.GetString() ?? "" : "";
        var ok = status is "VALID" or "VALIDATED";
        var tranId = root.TryGetProperty("tran_id", out var tid) ? tid.GetString() ?? "" : "";
        var amount = root.TryGetProperty("amount", out var amt) && decimal.TryParse(amt.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var a) ? a : 0m;
        var currency = root.TryGetProperty("currency", out var cur) ? cur.GetString() ?? "" : "";
        var bankTran = root.TryGetProperty("bank_tran_id", out var bt) ? bt.GetString() : null;
        return new GatewayValidationResult(ok, status, tranId, amount, currency, bankTran, raw);
    }

    public async Task<GatewayRefundResult> RefundAsync(GatewayRefundRequest request, CancellationToken ct)
    {
        EnsureConfigured();
        if (string.IsNullOrWhiteSpace(request.BankTranId))
            return new GatewayRefundResult(false, "MISSING", null, "bank_tran_id is required for a refund.", "{}");

        var url =
            $"{BaseHost}/validator/api/merchantTransIDvalidationAPI.php" +
            $"?bank_tran_id={Uri.EscapeDataString(request.BankTranId)}" +
            $"&refund_trans_id={Uri.EscapeDataString(request.RefundTranId)}" +
            $"&refund_amount={Uri.EscapeDataString(request.Amount.ToString("0.00", CultureInfo.InvariantCulture))}" +
            $"&refund_remarks={Uri.EscapeDataString(Truncate(request.Remarks, 255))}" +
            $"&store_id={Uri.EscapeDataString(Opt.StoreId)}" +
            $"&store_passwd={Uri.EscapeDataString(Opt.StorePassword)}" +
            $"&refe_id={Uri.EscapeDataString(request.RefundTranId)}" +
            "&format=json&v=1";
        var client = httpClients.CreateClient("sslcommerz");
        using var response = await client.GetAsync(url, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
        var root = doc.RootElement;
        var status = root.TryGetProperty("status", out var st) ? st.GetString() ?? "" : "";
        // success = initiated; processing = already initiated (idempotent replay)
        var ok = status is "success" or "processing";
        var refundRef = root.TryGetProperty("refund_ref_id", out var rr) ? rr.GetString() : null;
        var error = root.TryGetProperty("errorReason", out var er) ? er.GetString() : null;
        return new GatewayRefundResult(ok, status, refundRef, error, raw);
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(Opt.StoreId) || string.IsNullOrWhiteSpace(Opt.StorePassword))
            throw new SharedKernel.ServiceException(SharedKernel.ErrorKind.FailedPrecondition,
                "Payment gateway is not configured (missing SSLCommerz store credentials).");
    }

    private static string Truncate(string value, int max) =>
        string.IsNullOrWhiteSpace(value) ? "N/A" : (value.Length <= max ? value : value[..max]);
}
