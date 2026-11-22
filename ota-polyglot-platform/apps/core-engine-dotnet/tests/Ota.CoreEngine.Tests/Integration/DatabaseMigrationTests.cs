using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Tenancy;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>
/// I2: proves migrations (not EnsureCreated) actually stand up a working
/// schema, and that seeding stays idempotent under the migration-based
/// bootstrap. Deliberately does NOT use OtaCoreEngineFixture/WebApplicationFactory
/// — those already migrate the shared `ota` database as a side effect of every
/// other integration test in this suite; this test needs to independently prove
/// "migrations apply cleanly to a brand-new database," which means its own
/// throwaway sibling database on the same Postgres server, not the shared one.
/// </summary>
public sealed class DatabaseMigrationTests : IClassFixture<DatabaseMigrationTests.ThrowawayDatabase>
{
    private readonly ThrowawayDatabase _db;

    public DatabaseMigrationTests(ThrowawayDatabase db) => _db = db;

    [Fact]
    public async Task MigrateAsync_OnFreshDatabase_AppliesAllMigrationsAndCreatesExpectedSchema()
    {
        await using var ctx = _db.CreateContext();
        await ctx.Database.MigrateAsync();

        // Black-box proof: every DbSet is actually queryable against real
        // Postgres — catches a missing table/column/type, not just "some
        // CREATE TABLE ran."
        Assert.Equal(0, await ctx.Agents.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await ctx.Users.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await ctx.MarkupRules.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await ctx.Bookings.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await ctx.LedgerEntries.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await ctx.UserDevices.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await ctx.VerificationCodes.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await ctx.AgentTierProfiles.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await ctx.OutboxEvents.IgnoreQueryFilters().CountAsync());

        // Proves this was tracked migration application (via __EFMigrationsHistory),
        // not incidental schema drift.
        var applied = await ctx.Database.GetAppliedMigrationsAsync();
        Assert.Contains(applied, m => m.EndsWith("_InitialCreate"));
    }

    [Fact]
    public async Task SeedAsync_CalledTwice_DoesNotDuplicateSeedData()
    {
        await using var ctx = _db.CreateContext();
        await ctx.Database.MigrateAsync(); // idempotent no-op if the other Fact already ran

        var hasher = new BCryptPasswordHasher();
        var logger = NullLogger.Instance;

        await DbSeeder.SeedAsync(ctx, hasher, logger);
        var agentsAfterFirst = await ctx.Agents.IgnoreQueryFilters().CountAsync();
        var usersAfterFirst = await ctx.Users.IgnoreQueryFilters().CountAsync();
        var tierProfilesAfterFirst = await ctx.AgentTierProfiles.IgnoreQueryFilters().CountAsync();

        await DbSeeder.SeedAsync(ctx, hasher, logger); // must be a true no-op

        Assert.Equal(agentsAfterFirst, await ctx.Agents.IgnoreQueryFilters().CountAsync());
        Assert.Equal(usersAfterFirst, await ctx.Users.IgnoreQueryFilters().CountAsync());
        Assert.Equal(tierProfilesAfterFirst, await ctx.AgentTierProfiles.IgnoreQueryFilters().CountAsync());
        Assert.Equal(2, agentsAfterFirst); // agency + sub-agent, per DbSeeder
        Assert.Equal(2, usersAfterFirst); // demo agent login + platform admin
        Assert.Equal(4, tierProfilesAfterFirst); // one per AgentTier enum value
    }

    /// <summary>Creates a throwaway sibling database on the same Postgres server
    /// as the shared test stack, runs migrations/tests against it, then drops it
    /// — self-cleaning, and never touches the shared `ota` database.</summary>
    public sealed class ThrowawayDatabase : IAsyncLifetime
    {
        private readonly string _dbName = $"ota_migration_test_{Guid.NewGuid():N}";
        private string _adminConnectionString = default!;
        private DbContextOptions<OtaDbContext> _options = default!;

        public async Task InitializeAsync()
        {
            var baseConn = Environment.GetEnvironmentVariable("OTA_TEST_POSTGRES_CONNECTION")
                ?? "Host=localhost;Port=5432;Database=ota;Username=ota;Password=change-me-in-prod";

            var adminBuilder = new NpgsqlConnectionStringBuilder(baseConn) { Database = "postgres" };
            _adminConnectionString = adminBuilder.ConnectionString;

            await using var admin = new NpgsqlConnection(_adminConnectionString);
            await admin.OpenAsync();
            await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{_dbName}\"", admin))
                await create.ExecuteNonQueryAsync();

            var testConnBuilder = new NpgsqlConnectionStringBuilder(baseConn) { Database = _dbName };
            _options = new DbContextOptionsBuilder<OtaDbContext>()
                .UseNpgsql(testConnBuilder.ConnectionString)
                .Options;
        }

        public OtaDbContext CreateContext() => new(_options, new NoopTenantAccessor());

        public async Task DisposeAsync()
        {
            // Pooled connections keep the physical socket open even after the
            // OtaDbContext using them is disposed — DROP DATABASE fails with
            // "database is being accessed by other users" without this.
            NpgsqlConnection.ClearAllPools();

            await using var admin = new NpgsqlConnection(_adminConnectionString);
            await admin.OpenAsync();
            await using (var terminate = new NpgsqlCommand(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = @db AND pid <> pg_backend_pid()", admin))
            {
                terminate.Parameters.AddWithValue("db", _dbName);
                await terminate.ExecuteNonQueryAsync();
            }
            await using (var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_dbName}\"", admin))
                await drop.ExecuteNonQueryAsync();
        }

        private sealed class NoopTenantAccessor : ITenantAccessor
        {
            public TenantContext? Current => null;
            public void Set(TenantContext context) { }
        }
    }
}
