using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Ota.CoreEngine.Observability;

/// <summary>Alerts on unhandled exceptions from REST controllers, then returns ProblemDetails.</summary>
public sealed class GlobalExceptionHandler(IAlertNotifier notifier, ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken ct)
    {
        logger.LogError(exception, "Unhandled exception on {Method} {Path}", httpContext.Request.Method, httpContext.Request.Path);

        await notifier.NotifyAsync($"Unhandled exception on {httpContext.Request.Path}", exception,
            new Dictionary<string, string>
            {
                ["method"] = httpContext.Request.Method,
                ["path"] = httpContext.Request.Path.Value ?? string.Empty,
            }, ct);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
            Detail = "The error has been logged and the on-call channel notified.",
        }, ct);

        return true;
    }
}
