using System.Collections.Concurrent;
using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;

namespace Ota.CoreEngine.Observability;

/// <summary>
/// Fires Slack + email alerts for genuine unhandled exceptions (not expected
/// business rejections like insufficient credit or an expired offer — those
/// are normal control flow and are already logged where they occur).
///
/// Both channels are optional: unset SLACK_WEBHOOK_URL / SMTP_HOST and the
/// notifier logs a one-time warning and no-ops, so local dev without real
/// credentials keeps working. Delivery failures are swallowed here — an
/// alerting outage must never mask or replace the original exception.
/// </summary>
public interface IAlertNotifier
{
    Task NotifyAsync(string title, Exception exception, IReadOnlyDictionary<string, string>? context = null, CancellationToken ct = default);
}

public sealed class AlertNotifier : IAlertNotifier
{
    private static readonly TimeSpan ThrottleWindow = TimeSpan.FromMinutes(5);

    // In-memory, single-instance throttle — fine for this boilerplate's one
    // replica per service; swap for a Redis-backed key if you scale out.
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastSent = new();

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<AlertNotifier> _logger;
    private bool _warnedSlackUnconfigured;
    private bool _warnedSmtpUnconfigured;

    public AlertNotifier(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger<AlertNotifier> logger)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
        _logger = logger;
    }

    public async Task NotifyAsync(string title, Exception exception, IReadOnlyDictionary<string, string>? context = null, CancellationToken ct = default)
    {
        var throttleKey = $"{title}:{exception.GetType().FullName}";
        var now = DateTimeOffset.UtcNow;
        if (_lastSent.TryGetValue(throttleKey, out var last) && now - last < ThrottleWindow)
        {
            _logger.LogDebug("Alert throttled ({Key}); last sent {Last}", throttleKey, last);
            return;
        }
        _lastSent[throttleKey] = now;

        var body = BuildBody(title, exception, context);

        // Best-effort, independent of each other — a Slack outage shouldn't
        // block email and vice versa.
        await Task.WhenAll(SendSlackAsync(title, body, ct), SendEmailAsync(title, body, ct));
    }

    private static string BuildBody(string title, Exception exception, IReadOnlyDictionary<string, string>? context)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Service: core-engine");
        sb.AppendLine($"Title: {title}");
        sb.AppendLine($"Exception: {exception.GetType().FullName}: {exception.Message}");
        if (context is { Count: > 0 })
        {
            sb.AppendLine("Context:");
            foreach (var (key, value) in context)
                sb.AppendLine($"  {key} = {value}");
        }
        sb.AppendLine("Stack trace:");
        sb.AppendLine(exception.StackTrace is { Length: > 0 } st && st.Length > 2000 ? st[..2000] + "…(truncated)" : exception.StackTrace);
        return sb.ToString();
    }

    private async Task SendSlackAsync(string title, string body, CancellationToken ct)
    {
        var webhookUrl = _config["SLACK_WEBHOOK_URL"];
        if (string.IsNullOrWhiteSpace(webhookUrl))
        {
            if (!_warnedSlackUnconfigured)
            {
                _logger.LogWarning("SLACK_WEBHOOK_URL not set — Slack alerts disabled.");
                _warnedSlackUnconfigured = true;
            }
            return;
        }

        try
        {
            var client = _httpClientFactory.CreateClient("alerts");
            var payload = JsonSerializer.Serialize(new { text = $":rotating_light: *core-engine* — {title}\n```{Truncate(body, 2800)}```" });
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            var response = await client.PostAsync(webhookUrl, content, ct);
            if (!response.IsSuccessStatusCode)
                _logger.LogError("Slack alert failed: {Status}", response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to deliver Slack alert.");
        }
    }

    private async Task SendEmailAsync(string title, string body, CancellationToken ct)
    {
        var host = _config["SMTP_HOST"];
        if (string.IsNullOrWhiteSpace(host))
        {
            if (!_warnedSmtpUnconfigured)
            {
                _logger.LogWarning("SMTP_HOST not set — email alerts disabled.");
                _warnedSmtpUnconfigured = true;
            }
            return;
        }

        try
        {
            var port = int.TryParse(_config["SMTP_PORT"], out var p) ? p : 587;
            var from = _config["SMTP_FROM"] ?? "alerts@ota-platform.local";
            var to = _config["SMTP_TO"] ?? "oncall@ota-platform.local";

            using var client = new SmtpClient(host, port);
            var user = _config["SMTP_USER"];
            if (!string.IsNullOrWhiteSpace(user))
                client.Credentials = new NetworkCredential(user, _config["SMTP_PASSWORD"]);
            // SmtpClient can't probe STARTTLS support like the Python/Node
            // notifiers do, so this is an explicit opt-out rather than a port
            // guess. Real providers (SendGrid/SES/Mailgun/Gmail on 587) all
            // need this true; only a bare non-TLS relay needs it false.
            client.EnableSsl = !string.Equals(_config["SMTP_USE_TLS"], "false", StringComparison.OrdinalIgnoreCase);

            using var message = new MailMessage(from, to, $"[ALERT] core-engine — {title}", body);
            await client.SendMailAsync(message, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to deliver email alert.");
        }
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "…(truncated)";
}
