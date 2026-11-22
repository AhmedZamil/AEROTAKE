using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P2-6: the ai-engine reads core's outbox with raw SQL, so a schema or column change here can silently break it in another
/// service. These tests take the poller's two statements straight from its source file and have Postgres check them against the real,
/// migrated database — so moving the table (P2-2) cannot be done without the poller following, and the build says so.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class OutboxPollerContractTests(OtaCoreEngineFixture fixture)
{
    private static string PollerSource()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "apps", "ai-engine-python", "app", "outbox_poller.py");
            if (File.Exists(candidate)) return File.ReadAllText(candidate);
        }
        throw new FileNotFoundException("apps/ai-engine-python/app/outbox_poller.py not found above " + AppContext.BaseDirectory);
    }

    private static string Statement(string name)
    {
        var m = Regex.Match(PollerSource(), name + " = \"\"\"(.*?)\"\"\"", RegexOptions.Singleline);
        Assert.True(m.Success, $"{name} is not a plain triple-quoted constant in outbox_poller.py");
        return m.Groups[1].Value;
    }

    [Fact]
    public async Task ThePollersStatements_AreValidAgainstTheMigratedDatabase()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        await db.Database.OpenConnectionAsync(); // one connection throughout: prepared statements belong to a connection
        // PREPARE makes Postgres resolve every table and column named — it fails if either is missing — without running anything.
        await db.Database.ExecuteSqlRawAsync($"PREPARE poller_select(text) AS {Statement("SELECT_PENDING_SQL")}");
        await db.Database.ExecuteSqlRawAsync($"PREPARE poller_mark(uuid[]) AS {Statement("MARK_PROCESSED_SQL")}");
        await db.Database.ExecuteSqlRawAsync("DEALLOCATE poller_select");
        await db.Database.ExecuteSqlRawAsync("DEALLOCATE poller_mark");
    }

    [Fact]
    public async Task ThePollersSelect_ActuallyFindsAnEventCoreWrote_AndMarkingItProcessedHidesIt()
    {
        var topic = $"contract-{Guid.NewGuid():N}";
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var id = Guid.NewGuid();
        db.OutboxEvents.Add(new OutboxEvent { Id = id, TenantId = "contract-tenant", Key = "k", Topic = topic, Payload = "{}" });
        await db.SaveChangesAsync();
        var select = Statement("SELECT_PENDING_SQL").Replace("$1", "{0}");

        var before = await db.Database.SqlQueryRaw<Guid>(select.Replace("SELECT \"Id\", \"Topic\", \"Payload\"", "SELECT \"Id\" AS \"Value\""), topic).ToListAsync();
        await db.Database.ExecuteSqlRawAsync(Statement("MARK_PROCESSED_SQL").Replace("$1::uuid[]", "{0}"), new[] { id });
        var after = await db.Database.SqlQueryRaw<Guid>(select.Replace("SELECT \"Id\", \"Topic\", \"Payload\"", "SELECT \"Id\" AS \"Value\""), topic).ToListAsync();

        Assert.Equal(id, Assert.Single(before));
        Assert.Empty(after);
    }

    [Fact]
    public async Task TheOutboxIsInTheMessagingSchema_AndNoLongerInPublic()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();

        var found = await db.Database.SqlQueryRaw<string>(
            "SELECT table_schema AS \"Value\" FROM information_schema.tables WHERE table_name = 'OutboxEvents'").ToListAsync();

        Assert.Equal("messaging", Assert.Single(found));
    }
}

/// <summary>P2-2: every table belongs to a module's schema, or is deliberately global. A new entity added without deciding fails here.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class ModuleSchemaTests(OtaCoreEngineFixture fixture)
{
    [Fact]
    public void EveryTable_IsInAModulesSchema_ExceptGlobalReferenceData()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var model = scope.ServiceProvider.GetRequiredService<OtaDbContext>().Model;

        var unassigned = model.GetEntityTypes().Where(t => t.GetTableName() is not null && t.GetSchema() is null).Select(t => t.ClrType.Name).Order().ToList();

        Assert.Equal(["Airline", "Airport"], unassigned);   // global reference data, no tenant, no owner
    }

    [Fact]
    public async Task EveryTableInTheDatabase_IsWhereTheModelSaysItIs()
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var expected = db.Model.GetEntityTypes().Select(t => $"{t.GetSchema() ?? "public"}.{t.GetTableName()}").Order().ToList();

        var actual = await db.Database.SqlQueryRaw<string>(
            "SELECT table_schema || '.' || table_name AS \"Value\" FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') AND table_name <> '__EFMigrationsHistory' ORDER BY 1").ToListAsync();

        Assert.Equal(expected, actual);
    }
}
