using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Data;

/// <summary>Development-only: ensures a PlatformAdmin user exists so Postman / local ops can
/// call markup-rules and exchange-rates without SQL. Idempotent — safe on every restart.
/// Admins have no Agent (AgentId null); JWT channel claim is PLATFORM.</summary>
public static class PlatformAdminSeeder
{
    public const string DemoTenantAdminEmail = "admin@skybridge.example";
    public const string B2cTenantAdminEmail = "admin@aerotake-b2c.example";
    public const string Password = "Passw0rd!";
    /// <summary>Pre-registered device so the first Postman login skips email verification.</summary>
    public const string DeviceToken = "dev-admin-device";

    public static async Task SeedAsync(OtaDbContext db, IPasswordHasher passwordHasher, ILogger logger, CancellationToken ct = default)
    {
        await EnsureAsync(db, passwordHasher, logger, "demo-tenant", DemoTenantAdminEmail, "Platform", "Admin", ct);
        await EnsureAsync(db, passwordHasher, logger, "aerotake-b2c", B2cTenantAdminEmail, "B2C", "Admin", ct);
    }

    private static async Task EnsureAsync(
        OtaDbContext db,
        IPasswordHasher passwordHasher,
        ILogger logger,
        string tenantId,
        string email,
        string firstName,
        string lastName,
        CancellationToken ct)
    {
        // Tenant may not exist yet in a fresh DB before registry seed — skip quietly.
        if (!await db.Tenants.AnyAsync(t => t.TenantId == tenantId, ct)
            && !await db.Agents.IgnoreQueryFilters().AnyAsync(a => a.TenantId == tenantId, ct))
            return;

        var existing = await db.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.TenantId == tenantId && u.Email == email, ct);
        if (existing is not null)
        {
            if (existing.Role != UserRole.Admin)
            {
                existing.Role = UserRole.Admin;
                existing.AgentId = null;
                await db.SaveChangesAsync(ct);
                logger.LogInformation("Promoted {Email} to PlatformAdmin for tenant {TenantId}", email, tenantId);
            }
            await EnsureDeviceAsync(db, existing, ct);
            return;
        }

        var admin = new User
        {
            TenantId = tenantId,
            Email = email,
            PasswordHash = passwordHasher.Hash(Password),
            FirstName = firstName,
            LastName = lastName,
            Role = UserRole.Admin,
            AgentId = null,
            EmailVerified = true,
            IsActive = true,
        };
        db.Users.Add(admin);
        await db.SaveChangesAsync(ct);
        await EnsureDeviceAsync(db, admin, ct);

        logger.LogInformation(
            "Seeded PlatformAdmin login: {Email} / {Password} (tenant: {TenantId}, deviceToken: {DeviceToken})",
            email, Password, tenantId, DeviceToken);
    }

    private static async Task EnsureDeviceAsync(OtaDbContext db, User admin, CancellationToken ct)
    {
        if (await db.UserDevices.IgnoreQueryFilters()
                .AnyAsync(d => d.UserId == admin.Id && d.DeviceToken == DeviceToken, ct))
            return;

        db.UserDevices.Add(new UserDevice
        {
            TenantId = admin.TenantId,
            UserId = admin.Id,
            DeviceToken = DeviceToken,
        });
        await db.SaveChangesAsync(ct);
    }
}
