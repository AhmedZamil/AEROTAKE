using System.Collections.Concurrent;
using Ota.CoreEngine.Observability;

namespace Ota.CoreEngine.Tests.Fixtures;

/// <summary>Records alert calls instead of hitting real Slack/SMTP, so tests can
/// assert "no alert fired" for expected business rejections and "alert fired"
/// for genuine faults.</summary>
public sealed class FakeAlertNotifier : IAlertNotifier
{
    private readonly ConcurrentQueue<(string Title, Exception Exception)> _calls = new();

    public IReadOnlyCollection<(string Title, Exception Exception)> Calls => _calls.ToArray();

    public Task NotifyAsync(string title, Exception exception, IReadOnlyDictionary<string, string>? context = null, CancellationToken ct = default)
    {
        _calls.Enqueue((title, exception));
        return Task.CompletedTask;
    }

    public void Clear() => _calls.Clear();
}
