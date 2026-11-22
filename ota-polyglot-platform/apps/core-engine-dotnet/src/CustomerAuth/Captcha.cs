using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Ota.CoreEngine.CustomerAuth;

/// <summary>Is this visitor a person? Answered by Cloudflare Turnstile: a widget that almost never asks anyone to do anything (it checks the
/// browser quietly, and only shows a tick-box when it is unsure). The browser gets a one-time token; WE check it with Cloudflare, using a
/// secret that never leaves this server. Not configured (no TURNSTILE_SECRET) means the check is off, as in local development.</summary>
public interface ICaptchaVerifier
{
    bool IsEnabled { get; }

    /// <summary>True if the token is valid for this visitor. False for a missing/invalid/used token — and also if Cloudflare cannot be reached
    /// while the check is on: a protection that switches itself off when its service blinks is not a protection.</summary>
    Task<bool> VerifyAsync(string? token, string? clientIp, CancellationToken ct);
}

public sealed class TurnstileVerifier(IHttpClientFactory http, IConfiguration config, ILogger<TurnstileVerifier> logger) : ICaptchaVerifier
{
    public const string Endpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private string? Secret => config["TURNSTILE_SECRET"];
    public bool IsEnabled => !string.IsNullOrWhiteSpace(Secret);

    public async Task<bool> VerifyAsync(string? token, string? clientIp, CancellationToken ct)
    {
        if (!IsEnabled) return true;
        if (string.IsNullOrWhiteSpace(token) || token.Length > 2048) return false;

        try
        {
            using var client = http.CreateClient("turnstile");
            client.Timeout = TimeSpan.FromSeconds(5);
            var form = new Dictionary<string, string> { ["secret"] = Secret!, ["response"] = token };
            if (!string.IsNullOrEmpty(clientIp) && clientIp != "unknown") form["remoteip"] = clientIp;
            using var response = await client.PostAsync(config["TURNSTILE_VERIFY_URL"] is { Length: > 0 } url ? url : Endpoint, new FormUrlEncodedContent(form), ct);
            var result = await response.Content.ReadFromJsonAsync<SiteVerifyResponse>(cancellationToken: ct);
            return result?.Success == true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Could not reach the CAPTCHA service; refusing (the check is on, so it fails closed)");
            return false;
        }
    }

    private sealed record SiteVerifyResponse([property: JsonPropertyName("success")] bool Success);
}
