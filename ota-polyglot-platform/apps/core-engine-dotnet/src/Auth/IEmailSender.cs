using System.Net;
using System.Net.Mail;

namespace Ota.CoreEngine.Auth;

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct = default);
}

/// <summary>
/// Reuses the same SMTP_* env vars already wired for Observability/AlertNotifier —
/// one SMTP config for the whole service, transactional and alerting mail alike.
/// No-ops with a logged warning if SMTP_HOST isn't set, same "safe by default"
/// philosophy as AlertNotifier.
/// </summary>
public sealed class SmtpEmailSender(IConfiguration config, ILogger<SmtpEmailSender> logger) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        var host = config["SMTP_HOST"];
        if (string.IsNullOrWhiteSpace(host))
        {
            logger.LogWarning("SMTP_HOST not set — cannot send email to {To} (subject: {Subject}). Email disabled.", to, subject);
            return;
        }

        var port = int.TryParse(config["SMTP_PORT"], out var p) ? p : 587;
        var from = config["SMTP_FROM"] ?? "no-reply@ota-platform.local";
        var useTls = !string.Equals(config["SMTP_USE_TLS"], "false", StringComparison.OrdinalIgnoreCase);

        using var client = new SmtpClient(host, port) { EnableSsl = useTls };
        var user = config["SMTP_USER"];
        if (!string.IsNullOrWhiteSpace(user))
            client.Credentials = new NetworkCredential(user, config["SMTP_PASSWORD"]);

        using var message = new MailMessage(from, to, subject, body);
        await client.SendMailAsync(message, ct);
    }
}
