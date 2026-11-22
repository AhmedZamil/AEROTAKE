using System.Collections.Concurrent;
using Ota.CoreEngine.Auth;

namespace Ota.CoreEngine.Tests.Fixtures;

/// <summary>Records the mail the app would have sent, so tests can read what a customer would receive.</summary>
public sealed class FakeEmailSender : IEmailSender
{
    public ConcurrentQueue<(string To, string Subject, string Body)> Sent { get; } = new();

    public bool Fail { get; set; }

    public Task SendAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        if (Fail) throw new InvalidOperationException("smtp is down");
        Sent.Enqueue((to, subject, body));
        return Task.CompletedTask;
    }
}
