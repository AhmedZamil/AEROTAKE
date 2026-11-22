using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.RateLimiting;
using StackExchange.Redis;
using Xunit;
using Ota.CoreEngine.Tests.Fixtures;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>The sliding-window limiter against the real Redis: correctness, isolation, and atomicity under parallel load.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class RateLimiterTests(OtaCoreEngineFixture fixture)
{
    private IRateLimiter Limiter => fixture.Factory.Services.GetRequiredService<IRateLimiter>();
    private static string Bucket() => $"test-{Guid.NewGuid():N}";
    private static readonly TimeSpan Minute = TimeSpan.FromMinutes(1);

    [Fact]
    public async Task AllowsUpToTheLimit_ThenRefuses_WithARetryAfter()
    {
        var bucket = Bucket();

        for (var i = 1; i <= 3; i++)
        {
            var ok = await Limiter.HitAsync(bucket, "k", 3, Minute, default);
            Assert.True(ok.Allowed);
            Assert.Equal(i, ok.Count);
        }
        var refused = await Limiter.HitAsync(bucket, "k", 3, Minute, default);

        Assert.False(refused.Allowed);
        Assert.InRange(refused.RetryAfter, TimeSpan.FromSeconds(50), Minute);
    }

    [Fact]
    public async Task ARefusedAttempt_IsNotCounted_SoRetryingDoesNotExtendTheLockout()
    {
        var bucket = Bucket();
        await Limiter.HitAsync(bucket, "k", 1, TimeSpan.FromMilliseconds(600), default);

        for (var i = 0; i < 20; i++) await Limiter.HitAsync(bucket, "k", 1, TimeSpan.FromMilliseconds(600), default); // hammering while refused
        await Task.Delay(700);

        Assert.True((await Limiter.HitAsync(bucket, "k", 1, TimeSpan.FromMilliseconds(600), default)).Allowed); // the window slid past; hammering cost nothing
    }

    [Fact]
    public async Task TheWindowSlides_AnAllowanceReturnsAsAttemptsAgeOut()
    {
        var bucket = Bucket();
        var window = TimeSpan.FromMilliseconds(600);
        Assert.True((await Limiter.HitAsync(bucket, "k", 2, window, default)).Allowed);
        await Task.Delay(400);
        Assert.True((await Limiter.HitAsync(bucket, "k", 2, window, default)).Allowed);
        Assert.False((await Limiter.HitAsync(bucket, "k", 2, window, default)).Allowed);

        await Task.Delay(300); // the first attempt (0.7s ago) has left the window; the second (0.3s ago) has not

        Assert.True((await Limiter.HitAsync(bucket, "k", 2, window, default)).Allowed);
        Assert.False((await Limiter.HitAsync(bucket, "k", 2, window, default)).Allowed);
    }

    [Fact]
    public async Task DifferentKeysAndBuckets_DoNotShareACount()
    {
        var (a, b) = (Bucket(), Bucket());
        await Limiter.HitAsync(a, "one", 1, Minute, default);

        Assert.False((await Limiter.HitAsync(a, "one", 1, Minute, default)).Allowed);
        Assert.True((await Limiter.HitAsync(a, "two", 1, Minute, default)).Allowed);   // another key
        Assert.True((await Limiter.HitAsync(b, "one", 1, Minute, default)).Allowed);   // another bucket
    }

    [Fact]
    public async Task Peek_ReportsTheLimitWithoutCounting()
    {
        var bucket = Bucket();

        for (var i = 0; i < 10; i++) Assert.True((await Limiter.PeekAsync(bucket, "k", 2, Minute, default)).Allowed); // peeking never uses the allowance
        await Limiter.HitAsync(bucket, "k", 2, Minute, default);
        Assert.True((await Limiter.PeekAsync(bucket, "k", 2, Minute, default)).Allowed);
        await Limiter.HitAsync(bucket, "k", 2, Minute, default);

        var peek = await Limiter.PeekAsync(bucket, "k", 2, Minute, default);
        Assert.False(peek.Allowed);
        Assert.Equal(2, peek.Count);
    }

    [Fact]
    public async Task ParallelAttempts_CannotSlipPastTheLimitTogether()
    {
        var bucket = Bucket();

        var results = await Task.WhenAll(Enumerable.Range(0, 60).Select(_ => Task.Run(() => Limiter.HitAsync(bucket, "k", 10, Minute, default))));

        Assert.Equal(10, results.Count(r => r.Allowed)); // atomic in Redis: exactly the limit, never more
    }

    [Fact]
    public async Task KeysAreCaseAndWhitespaceInsensitive_SoTheyCannotBeEvadedByFormatting()
    {
        var bucket = Bucket();
        await Limiter.HitAsync(bucket, "Victim@Example.test", 1, Minute, default);

        Assert.False((await Limiter.HitAsync(bucket, "  victim@example.TEST ", 1, Minute, default)).Allowed);
    }

    [Fact]
    public async Task NoPersonalDataIsStoredInRedisInClear()
    {
        var bucket = Bucket();
        await Limiter.HitAsync(bucket, "private.person@example.test", 5, Minute, default);

        var redis = fixture.Factory.Services.GetRequiredService<IConnectionMultiplexer>();
        var keys = redis.GetServer(redis.GetEndPoints()[0]).Keys(pattern: $"rl:{bucket}:*").Select(k => k.ToString()).ToList();

        Assert.Single(keys);
        Assert.DoesNotContain("private", keys[0]);
        Assert.DoesNotContain("example", keys[0]);
    }

    [Fact]
    public async Task TheStoredKey_Expires_SoTheLimiterDoesNotLeakMemory()
    {
        var bucket = Bucket();
        await Limiter.HitAsync(bucket, "k", 5, TimeSpan.FromSeconds(30), default);

        var redis = fixture.Factory.Services.GetRequiredService<IConnectionMultiplexer>();
        var ttl = await redis.GetDatabase().KeyTimeToLiveAsync(RedisRateLimiter.RedisKeyFor(bucket, "k"));

        Assert.NotNull(ttl);
        Assert.InRange(ttl!.Value, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(31));
    }
}
