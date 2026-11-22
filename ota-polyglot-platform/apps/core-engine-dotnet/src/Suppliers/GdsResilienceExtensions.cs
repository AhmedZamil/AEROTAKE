using System.Net;
using Microsoft.Extensions.Http.Resilience;
using Polly;

namespace Ota.CoreEngine.Suppliers;

/// <summary>
/// Timeout/retry/circuit-breaker policies for GDS/ITA supplier HTTP calls
/// (Sabre today; any future second provider reuses these unchanged). Split
/// into two profiles because not every supplier call is safe to retry:
///
///   - Read (search/revalidate/token): idempotent, no side effects on the
///     supplier — safe to retry on a transient failure.
///   - Transactional (PNR create, ticket issue): NOT idempotent — if our
///     request times out after the supplier already processed it, a blind
///     retry could create a duplicate PNR or duplicate ticket charge. These
///     get a timeout and circuit breaker only, never an automatic retry.
/// </summary>
public static class GdsResilienceExtensions
{
    /// <summary>Supplier connections that cannot go stale. A pooled keep-alive connection can be silently killed (Docker Desktop's network after a
    /// sleep or restart, a supplier's load balancer); the next search then stalls on it until a timeout, and a search that has a 12-second limit
    /// returns nothing. Connections here are retired after 2 minutes (30 s idle) and a new one must be made within 8 s.</summary>
    public static IHttpClientBuilder AddFreshConnections(this IHttpClientBuilder builder) =>
        builder.ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(2),
            PooledConnectionIdleTimeout = TimeSpan.FromSeconds(30),
            ConnectTimeout = TimeSpan.FromSeconds(8),
        });

    public static IHttpClientBuilder AddGdsReadResilience(this IHttpClientBuilder builder, TimeSpan? perAttempt = null, TimeSpan? total = null, int maxRetries = 3)
    {
        var attemptTimeout = perAttempt ?? TimeSpan.FromSeconds(15);
        var totalTimeout = total ?? TimeSpan.FromSeconds(30);
        // Strategies execute in the order added, each nesting inside the
        // previous one — so the TOTAL budget must come first (outermost,
        // wraps every retry attempt combined) and the PER-ATTEMPT timeout
        // must come last (innermost, applies to just one attempt). Getting
        // this backwards makes the "per-attempt" timeout actually bound the
        // whole retry sequence, silently disabling retries in practice.
        builder.AddResilienceHandler("gds-read", pipeline =>
        {
            pipeline.AddTimeout(totalTimeout); // total budget, outermost
            pipeline.AddRetry(new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = maxRetries,
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = true,
                Delay = TimeSpan.FromSeconds(1),
                ShouldHandle = static args => ValueTask.FromResult(IsTransientFailure(args.Outcome)),
            });
            pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
            {
                FailureRatio = 0.5,
                MinimumThroughput = 5,
                SamplingDuration = TimeSpan.FromSeconds(30),
                BreakDuration = TimeSpan.FromSeconds(15),
                ShouldHandle = static args => ValueTask.FromResult(IsTransientFailure(args.Outcome)),
            });
            // per-attempt, innermost. Hajee's search takes about 8 s on a good day (measured: 7.4-8.0 s over six searches), so 10 s left almost no
            // margin and an ordinary slow answer was cut off, dropping every Hajee fare from the results.
            pipeline.AddTimeout(attemptTimeout);
        });
        return builder;
    }

    public static IHttpClientBuilder AddGdsTransactionalResilience(this IHttpClientBuilder builder)
    {
        builder.AddResilienceHandler("gds-transactional", static pipeline =>
        {
            pipeline.AddTimeout(TimeSpan.FromSeconds(25)); // total budget, outermost
            pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
            {
                FailureRatio = 0.8,
                MinimumThroughput = 3,
                SamplingDuration = TimeSpan.FromSeconds(30),
                BreakDuration = TimeSpan.FromSeconds(30),
                ShouldHandle = static args => ValueTask.FromResult(IsTransientFailure(args.Outcome)),
            });
            // Deliberately no retry strategy here — see class doc comment.
            pipeline.AddTimeout(TimeSpan.FromSeconds(20)); // per-attempt, innermost
        });
        return builder;
    }

    /// <summary>Network errors, timeouts, 5xx, 408 and 429 — never a 4xx
    /// (a bad request retrying won't fix) and never a "successful but
    /// unexpected content" response (that's a business-logic failure the
    /// caller already handles via the null-on-failure contract).</summary>
    private static bool IsTransientFailure(Outcome<HttpResponseMessage> outcome)
    {
        if (outcome.Exception is not null) return true;
        var status = outcome.Result?.StatusCode;
        return status is HttpStatusCode.RequestTimeout
            or HttpStatusCode.TooManyRequests
            or >= HttpStatusCode.InternalServerError;
    }
}
