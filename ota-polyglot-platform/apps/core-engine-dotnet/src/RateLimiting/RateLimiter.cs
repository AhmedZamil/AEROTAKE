using System.Security.Cryptography;
using System.Text;
using StackExchange.Redis;

namespace Ota.CoreEngine.RateLimiting;

/// <param name="Allowed">Whether this attempt may proceed.</param>
/// <param name="Count">Attempts currently counted in the window.</param>
/// <param name="RetryAfter">When refused: how long until the oldest counted attempt leaves the window.</param>
public readonly record struct RateDecision(bool Allowed, int Count, TimeSpan RetryAfter);

/// <summary>A sliding-window limiter. Sliding, not fixed: a fixed window lets an attacker spend a full allowance at the end of one
/// window and another at the start of the next. Atomic in the store, so parallel requests cannot slip past the limit together.</summary>
public interface IRateLimiter
{
    /// <summary>Counts this attempt and says whether it is within the limit.</summary>
    Task<RateDecision> HitAsync(string bucket, string key, int limit, TimeSpan window, CancellationToken ct);

    /// <summary>Says whether the limit is ALREADY reached, without counting anything — for limits on failures, where the check
    /// happens before the work and the count only after it fails.</summary>
    Task<RateDecision> PeekAsync(string bucket, string key, int limit, TimeSpan window, CancellationToken ct);
}

/// <summary>Redis-backed. The key is hashed before it is stored, so an email address or booking reference never sits in Redis in clear.</summary>
public sealed class RedisRateLimiter(IConnectionMultiplexer redis) : IRateLimiter
{
    // Redis' own clock, so several core instances agree on time. Trims what has left the window, then either counts or refuses.
    private const string HitScript = @"
        local t = redis.call('TIME')
        local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
        local window = tonumber(ARGV[1]); local limit = tonumber(ARGV[2]); local count_it = ARGV[3] == '1'
        redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
        local count = redis.call('ZCARD', KEYS[1])
        if count >= limit then
            local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
            return {0, count, tonumber(oldest[2]) + window - now}
        end
        if count_it then
            redis.call('ZADD', KEYS[1], now, now .. ':' .. ARGV[4])
            redis.call('PEXPIRE', KEYS[1], window)
            count = count + 1
        end
        return {1, count, 0}";

    public Task<RateDecision> HitAsync(string bucket, string key, int limit, TimeSpan window, CancellationToken ct) => RunAsync(bucket, key, limit, window, count: true);
    public Task<RateDecision> PeekAsync(string bucket, string key, int limit, TimeSpan window, CancellationToken ct) => RunAsync(bucket, key, limit, window, count: false);

    private async Task<RateDecision> RunAsync(string bucket, string key, int limit, TimeSpan window, bool count)
    {
        var result = (long[])(await redis.GetDatabase().ScriptEvaluateAsync(HitScript,
            [(RedisKey)RedisKeyFor(bucket, key)],
            [(RedisValue)(long)window.TotalMilliseconds, (RedisValue)limit, (RedisValue)(count ? "1" : "0"), (RedisValue)Guid.NewGuid().ToString("N")]))!;
        return new RateDecision(result[0] == 1, (int)result[1], TimeSpan.FromMilliseconds(Math.Max(0, result[2])));
    }

    public static string RedisKeyFor(string bucket, string key) =>
        $"rl:{bucket}:{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key.Trim().ToLowerInvariant()))).ToLowerInvariant()[..32]}";
}
