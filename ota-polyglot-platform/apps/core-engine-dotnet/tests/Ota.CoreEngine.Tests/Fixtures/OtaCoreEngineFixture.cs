using Xunit;

namespace Ota.CoreEngine.Tests.Fixtures;

/// <summary>
/// Uses the project's running docker-compose services instead of spinning up a
/// separate Postgres/Redis instance per test run. This matches the repo's real
/// runtime and avoids mismatches between the app stack and the test harness.
/// </summary>
public class OtaCoreEngineFixture : IAsyncLifetime
{
    protected static readonly string PostgresConnectionString =
        Environment.GetEnvironmentVariable("OTA_TEST_POSTGRES_CONNECTION")
        ?? "Host=localhost;Port=5432;Database=ota;Username=ota;Password=change-me-in-prod";

    protected static readonly string RedisConnectionString =
        Environment.GetEnvironmentVariable("OTA_TEST_REDIS_CONNECTION")
        ?? "localhost:6379,abortConnect=false";

    public FakeAlertNotifier AlertNotifier { get; } = new();
    public OtaCoreEngineFactory Factory { get; protected set; } = default!;

    public virtual async Task InitializeAsync()
    {
        // The project stack is already started by docker compose; tests only need
        // to point the app factory at the shared Postgres/Redis services.
        await Task.CompletedTask;
        Factory = new OtaCoreEngineFactory(PostgresConnectionString, RedisConnectionString, AlertNotifier);
    }

    public virtual async Task DisposeAsync()
    {
        await Factory.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class OtaCoreEngineCollection : ICollectionFixture<OtaCoreEngineFixture>
{
    public const string Name = "OtaCoreEngine";
}
