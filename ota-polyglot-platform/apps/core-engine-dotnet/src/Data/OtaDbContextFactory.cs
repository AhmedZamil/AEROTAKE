using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Data;

/// <summary>
/// Used exclusively by `dotnet ef` design-time commands (migrations add/remove/
/// list, database update, etc). Its presence makes EF Core tooling skip
/// invoking Program.cs's top-level startup code entirely — which matters
/// because that code migrates the real database and fails fast on error
/// (see Program.cs); design-time commands must never trigger that as a
/// side effect of e.g. scaffolding a migration with no Postgres reachable.
/// </summary>
public sealed class OtaDbContextFactory : IDesignTimeDbContextFactory<OtaDbContext>
{
    public OtaDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Postgres")
            ?? "Host=localhost;Port=5432;Database=ota;Username=ota;Password=ota";

        var options = new DbContextOptionsBuilder<OtaDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new OtaDbContext(options, new DesignTimeTenantAccessor());
    }

    // ITenantAccessor only affects query-filter closures at query time, not
    // OnModelCreating/schema shape, so a no-op stub is sufficient here.
    private sealed class DesignTimeTenantAccessor : ITenantAccessor
    {
        public TenantContext? Current => null;
        public void Set(TenantContext context) { }
    }
}
