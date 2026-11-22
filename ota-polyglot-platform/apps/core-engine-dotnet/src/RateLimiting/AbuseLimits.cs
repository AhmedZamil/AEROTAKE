using Microsoft.AspNetCore.Mvc;

namespace Ota.CoreEngine.RateLimiting;

/// <summary>One named limit: how many, in what window.</summary>
public sealed record Limit(string Bucket, int Max, TimeSpan Window);

/// <summary>The limits on the anonymous consumer endpoints — the ones open to the whole internet. Chosen so that a person using the
/// site normally never notices them, and a script guessing at it stops within seconds.
///
/// A reference and a surname are easy to learn or guess, so the limit that really protects bookings is the per-REFERENCE one on
/// FAILED lookups: however many addresses an attacker guesses from, one reference only ever gets a handful of wrong surnames.</summary>
public static class AbuseLimits
{
    // ---- guest booking lookup
    public static readonly Limit GuestLookupPerIp = new("guest-lookup-ip", 30, TimeSpan.FromMinutes(10));
    public static readonly Limit GuestLookupFailuresPerReference = new("guest-lookup-fail-ref", 5, TimeSpan.FromMinutes(15));
    public static readonly Limit GuestAccessPerIp = new("guest-access-ip", 60, TimeSpan.FromMinutes(10));

    // ---- "email me a link": per-IP limits are visible (429); per-target limits are SILENT (202, nothing sent), so they cannot
    //      be used to learn whether an address or reference exists — and they stop a stranger mail-bombing someone's inbox.
    public static readonly Limit SendLinkPerIp = new("send-link-ip", 5, TimeSpan.FromMinutes(10));
    public static readonly Limit SendLinkPerEmail = new("send-link-email", 3, TimeSpan.FromHours(1));
    public static readonly Limit SendLinkPerReference = new("send-link-ref", 3, TimeSpan.FromHours(1));

    // ---- making a booking. Each one asks a supplier to HOLD seats, so an anonymous script must not be able to hold a route's inventory.
    public static readonly Limit GuestBookPerIp = new("guest-book-ip", 10, TimeSpan.FromMinutes(10));
    public static readonly Limit GuestBookPerEmail = new("guest-book-email", 5, TimeSpan.FromHours(1));
    public static readonly Limit CustomerBookPerCustomer = new("customer-book", 20, TimeSpan.FromHours(1));
    public static readonly Limit CustomerCancelPerCustomer = new("customer-cancel", 10, TimeSpan.FromHours(1));
    public static readonly Limit GuestCancelPerIp = new("guest-cancel-ip", 20, TimeSpan.FromMinutes(10));

    // ---- customer sign-in
    public static readonly Limit SignInPerIp = new("signin-ip", 30, TimeSpan.FromMinutes(10));
    public static readonly Limit SignInFailuresPerIp = new("signin-fail-ip", 10, TimeSpan.FromMinutes(10));
    public static readonly Limit RefreshPerIp = new("refresh-ip", 120, TimeSpan.FromMinutes(10));

    // ---- email + password accounts. Wrong passwords are limited per ADDRESS as well as per client, so a botnet cannot grind one account, and a
    //      stranger can lock out nobody for longer than the window (the customer can always use Google or the reset link).
    /// <summary>Failed sign-ins (for an address, or from a client) after which the next attempt must carry a CAPTCHA.</summary>
    public const int CaptchaAfterFailures = 3;
    public static readonly Limit RegisterPerIp = new("register-ip", 10, TimeSpan.FromHours(1));
    public static readonly Limit LoginFailuresPerEmail = new("login-fail-email", 8, TimeSpan.FromMinutes(15));
    public static readonly Limit ForgotPasswordPerIp = new("forgot-ip", 10, TimeSpan.FromHours(1));
    public static readonly Limit ForgotPasswordPerEmail = new("forgot-email", 3, TimeSpan.FromHours(1));   // silent
    public static readonly Limit ResendVerificationPerCustomer = new("resend-verify", 3, TimeSpan.FromHours(1));
    public static readonly Limit TokenRedeemPerIp = new("email-token-ip", 30, TimeSpan.FromMinutes(10));

    // ---- service-token endpoint (secrets are 256-bit, so this is about load and noise, not guessing)
    public static readonly Limit ServiceTokenPerIp = new("service-token-ip", 30, TimeSpan.FromMinutes(1));

    // ---- agent auth. Money moves on one login and device codes are 6 digits, so guessing is limited per ACCOUNT as well
    //      as per client. Buckets are separate from the consumer ones so a storefront attacker cannot exhaust an agency's allowance.
    public static readonly Limit AgentLoginPerIp = new("agent-login-ip", 30, TimeSpan.FromMinutes(10));
    public static readonly Limit AgentLoginFailuresPerIp = new("agent-login-fail-ip", 10, TimeSpan.FromMinutes(10));
    public static readonly Limit AgentLoginFailuresPerEmail = new("agent-login-fail-email", 8, TimeSpan.FromMinutes(15));
    public static readonly Limit AgentRegisterPerIp = new("agent-register-ip", 5, TimeSpan.FromHours(1));
    public static readonly Limit AgentForgotPasswordPerIp = new("agent-forgot-ip", 10, TimeSpan.FromHours(1));
    public static readonly Limit AgentForgotPasswordPerEmail = new("agent-forgot-email", 3, TimeSpan.FromHours(1)); // silent
    public static readonly Limit AgentVerifyDevicePerIp = new("agent-verify-ip", 30, TimeSpan.FromMinutes(10));
    public static readonly Limit AgentVerifyDeviceFailuresPerUser = new("agent-verify-fail-user", 5, TimeSpan.FromMinutes(15));
    public static readonly Limit AgentResetPasswordPerIp = new("agent-reset-ip", 30, TimeSpan.FromMinutes(10));
    public static readonly Limit AgentRefreshPerIp = new("agent-refresh-ip", 120, TimeSpan.FromMinutes(10));
}

/// <summary>The rate-limit decisions the controllers make, in one place. Every method fails CLOSED: if the limiter's store is
/// unavailable the request is refused (503) rather than waved through, because a limiter that turns off when Redis blinks is not a limit.</summary>
public interface IAbuseGuard
{
    /// <summary>Counts an attempt against a limit and returns the response to send if it must be refused (429, or 503 when the
    /// limiter is down); null when the attempt may proceed.</summary>
    Task<IActionResult?> HitAsync(HttpContext http, Limit limit, string key, CancellationToken ct);

    /// <summary>Refuses (as HitAsync does) if the limit is already reached, without counting — the "before" half of a failure limit.</summary>
    Task<IActionResult?> CheckAsync(HttpContext http, Limit limit, string key, CancellationToken ct);

    /// <summary>The "after" half of a failure limit: counts one failure. Never refuses (the failure already happened).</summary>
    Task RecordFailureAsync(Limit limit, string key, CancellationToken ct);

    /// <summary>A SILENT per-target limit: true if allowed (and counted). False means "do not do the work, but answer as usual".</summary>
    Task<bool> AllowQuietlyAsync(Limit limit, string key, CancellationToken ct);

    /// <summary>How many failures are on record for a key right now (without counting one). Lets a caller ask for extra proof — a CAPTCHA — only
    /// after a few, so ordinary users never meet it. Fails safe: if the limiter is down it reports "many".</summary>
    Task<int> RecentFailuresAsync(Limit limit, string key, CancellationToken ct);

    /// <summary>The client's address as core sees it (X-Forwarded-For honoured only from trusted proxy networks).</summary>
    string ClientKey(HttpContext http);
}

public sealed class AbuseGuard(IRateLimiter limiter, IConfiguration config, ILogger<AbuseGuard> logger) : IAbuseGuard
{
    /// <summary>Tests and local tooling that must not be throttled turn the limits off; anything else leaves them on.</summary>
    private bool Enabled => !string.Equals(config["RateLimiting:Enabled"], "false", StringComparison.OrdinalIgnoreCase);

    public string ClientKey(HttpContext http) => http.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    public Task<IActionResult?> HitAsync(HttpContext http, Limit limit, string key, CancellationToken ct) =>
        DecideAsync(http, limit, key, ct, count: true);

    public Task<IActionResult?> CheckAsync(HttpContext http, Limit limit, string key, CancellationToken ct) =>
        DecideAsync(http, limit, key, ct, count: false);

    private async Task<IActionResult?> DecideAsync(HttpContext http, Limit limit, string key, CancellationToken ct, bool count)
    {
        if (!Enabled) return null;
        try
        {
            var decision = count
                ? await limiter.HitAsync(limit.Bucket, key, limit.Max, limit.Window, ct)
                : await limiter.PeekAsync(limit.Bucket, key, limit.Max, limit.Window, ct);
            if (decision.Allowed) return null;

            var retry = (int)Math.Ceiling(decision.RetryAfter.TotalSeconds);
            http.Response.Headers.RetryAfter = retry.ToString();
            logger.LogWarning("Rate limit {Bucket} reached ({Count}/{Max}); refusing until {Retry}s", limit.Bucket, decision.Count, limit.Max, retry);
            return new ObjectResult(new { error = "rate_limited", message = "Too many attempts. Please wait a moment and try again.", retryAfterSeconds = retry })
            { StatusCode = StatusCodes.Status429TooManyRequests };
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "The rate limiter is unavailable; refusing {Bucket} rather than allowing unlimited attempts", limit.Bucket);
            return new ObjectResult(new { error = "rate_limiter_unavailable", message = "This is temporarily unavailable. Please try again shortly." })
            { StatusCode = StatusCodes.Status503ServiceUnavailable };
        }
    }

    public async Task<int> RecentFailuresAsync(Limit limit, string key, CancellationToken ct)
    {
        if (!Enabled) return 0;
        try { return (await limiter.PeekAsync(limit.Bucket, key, limit.Max, limit.Window, ct)).Count; }
        catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogError(ex, "Could not read failures for {Bucket}", limit.Bucket); return int.MaxValue; }
    }

    public async Task RecordFailureAsync(Limit limit, string key, CancellationToken ct)
    {
        if (!Enabled) return;
        try { await limiter.HitAsync(limit.Bucket, key, limit.Max, limit.Window, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogError(ex, "Could not record a failure for {Bucket}", limit.Bucket); }
    }

    public async Task<bool> AllowQuietlyAsync(Limit limit, string key, CancellationToken ct)
    {
        if (!Enabled) return true;
        try { return (await limiter.HitAsync(limit.Bucket, key, limit.Max, limit.Window, ct)).Allowed; }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "The rate limiter is unavailable; suppressing the {Bucket} action", limit.Bucket);
            return false; // fail closed, and quietly: the caller still gets the usual answer
        }
    }
}
