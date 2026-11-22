using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Tests.Fixtures;

/// <summary>Seeds isolated per-test data directly via the DbContext. Each call
/// uses a fresh, unique TenantId so tests sharing one Testcontainers Postgres
/// (via the collection fixture) never collide with each other or with the
/// app's own demo-tenant seed data.</summary>
public static class TestData
{
    /// <summary>A consumer (B2C) booking, as the B2C booking flow will create them: no agent, and either a guest email or a customer.
    /// The traveller JSON carries a passport number on purpose, so tests can prove it never leaks. Returns the booking.</summary>
    public static async Task<Booking> SeedB2CBookingAsync(
        OtaCoreEngineFactory factory, string tenantId, string pnr, string? guestEmail = null, Guid? customerId = null,
        string firstName = "Sam", string lastName = "Rahman", string channel = BookingChannels.B2C, Guid? agentId = null)
    {
        using var scope = CreateTenantScope(factory, tenantId);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var booking = new Booking
        {
            TenantId = tenantId, Channel = channel, AgentId = agentId, CustomerId = customerId, GuestEmail = guestEmail,
            Pnr = pnr, OfferId = "X", SupplierCode = "SABRE", SupplierPnrId = "SUPPLIER-SECRET-REF",
            IdempotencyKey = Guid.NewGuid().ToString(), Status = BookingStatus.Confirmed, FinalPrice = 250m, Currency = "BDT",
            SupplierNetRate = 200m, SubAgentMargin = 10m,
            TravelersJson = System.Text.Json.JsonSerializer.Serialize(new[] { new { FirstName = firstName, LastName = lastName, DocumentType = "PASSPORT", DocumentNumber = "P9999999" } }),
        };
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();
        return booking;
    }

    /// <summary>Registers a tenant as a live B2C storefront (tenant + an active B2C domain), which customer sign-in requires.
    /// Returns the tenant id.</summary>
    public static async Task<string> RegisterB2CTenantAsync(OtaCoreEngineFactory factory, string? tenantId = null, bool active = true)
    {
        tenantId ??= $"b2c-test-{Guid.NewGuid():N}";
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var tenant = new Tenant { TenantId = tenantId, DisplayName = "B2C test", SellCurrency = "BDT", IsActive = active };
        tenant.Domains.Add(new TenantDomain
        {
            Host = $"{Guid.NewGuid():N}.b2c.example.test", Channel = "B2C", BrandName = "B2C", LogoUrl = "/l.svg",
            PrimaryColor = "#111111", AccentColor = "#222222", MarkupProfile = "b2c-default",
        });
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync();
        return tenantId;
    }

    /// <summary>Marks an offer id as issued to this tenant, for tests that book a
    /// fabricated stub offer id directly instead of searching first — core now
    /// refuses any offer id it did not issue to the calling tenant (F9).</summary>
    public static Task OwnOfferAsync(OtaCoreEngineFactory factory, string tenantId, string offerId) =>
        factory.Services.GetRequiredService<Ota.CoreEngine.Suppliers.IOfferOwnership>()
            .RegisterAsync(tenantId, [offerId], CancellationToken.None);

    public static async Task<(string TenantId, Guid AgentId, string AccessToken)> SeedAgentAsync(
        OtaCoreEngineFactory factory,
        AgentTier tier = AgentTier.Gold,
        decimal creditLimit = 1000m,
        decimal markupPercent = 0.06m,
        decimal subAgentDefaultMargin = 10m,
        string? tenantId = null,
        bool isActive = true,
        bool seedConsumerRule = false)
    {
        tenantId ??= $"test-tenant-{Guid.NewGuid():N}";

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var jwtService = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var tenantAccessor = scope.ServiceProvider.GetRequiredService<ITenantAccessor>();

        // Set tenant context so the query filters work correctly
        tenantAccessor.Set(new TenantContext { TenantId = tenantId });

        var agent = new Agent
        {
            TenantId = tenantId,
            DisplayName = "Test Agency",
            Email = $"{Guid.NewGuid():N}@test.example",
            Tier = tier,
            CreditLimit = creditLimit,
            IsActive = isActive,
        };
        db.Agents.Add(agent);
        db.MarkupRules.Add(new MarkupRule
        {
            TenantId = tenantId,
            Tier = tier,
            MarkupPercent = markupPercent,
            SubAgentDefaultMargin = subAgentDefaultMargin,
        });
        // Consumer (B2C) pricing is opt-in: most tests are about agents, and an extra rule would change their rule counts.
        if (seedConsumerRule)
            db.MarkupRules.Add(new MarkupRule
            {
                TenantId = tenantId, Channel = MarkupChannels.B2C, Tier = null,
                MarkupPercent = markupPercent, SubAgentDefaultMargin = subAgentDefaultMargin,
            });
        
        // Create a test user associated with the agent for JWT token generation
        var user = new User
        {
            TenantId = tenantId,
            Email = agent.Email,
            FirstName = "Test",
            LastName = "User",
            PasswordHash = passwordHasher.Hash("test-password"),
            EmailVerified = true,
            IsActive = true,
            AgentId = agent.Id,
            Role = UserRole.AgencyAdmin,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        // Generate JWT token for this user
        var token = jwtService.IssueTokens(user).AccessToken;

        return (tenantId, agent.Id, token);
    }

    /// <summary>Seeds a second agent in an already-existing tenant, with a user
    /// of the given role tied to it — for cross-agent (same-tenant) authorization
    /// tests, where TenantIsolationTests' cross-tenant seeding doesn't apply.</summary>
    public static async Task<(Guid AgentId, string AccessToken)> SeedAgentUserAsync(
        OtaCoreEngineFactory factory,
        string tenantId,
        UserRole role,
        AgentTier tier = AgentTier.Gold,
        decimal creditLimit = 1000m)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var jwtService = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var tenantAccessor = scope.ServiceProvider.GetRequiredService<ITenantAccessor>();
        tenantAccessor.Set(new TenantContext { TenantId = tenantId });

        var agent = new Agent
        {
            TenantId = tenantId,
            DisplayName = "Second Test Agency",
            Email = $"{Guid.NewGuid():N}@test.example",
            Tier = tier,
            CreditLimit = creditLimit,
        };
        db.Agents.Add(agent);

        var user = new User
        {
            TenantId = tenantId,
            Email = $"{Guid.NewGuid():N}@test.example",
            FirstName = "Test",
            LastName = "User",
            PasswordHash = passwordHasher.Hash("test-password"),
            EmailVerified = true,
            IsActive = true,
            AgentId = agent.Id,
            Role = role,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var token = jwtService.IssueTokens(user).AccessToken;
        return (agent.Id, token);
    }

    /// <summary>Seeds a platform Admin user for a tenant — no associated Agent,
    /// matching AuthController's actual model (Admins are never self-registered;
    /// there is no bootstrap endpoint for this role yet, only direct seeding).</summary>
    public static async Task<string> SeedAdminUserAsync(OtaCoreEngineFactory factory, string tenantId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var jwtService = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var tenantAccessor = scope.ServiceProvider.GetRequiredService<ITenantAccessor>();
        tenantAccessor.Set(new TenantContext { TenantId = tenantId });

        var admin = new User
        {
            TenantId = tenantId,
            Email = $"{Guid.NewGuid():N}@test.example",
            FirstName = "Admin",
            LastName = "User",
            PasswordHash = passwordHasher.Hash("test-password"),
            EmailVerified = true,
            IsActive = true,
            AgentId = null,
            Role = UserRole.Admin,
        };
        db.Users.Add(admin);
        await db.SaveChangesAsync();

        return jwtService.IssueTokens(admin).AccessToken;
    }

    /// <summary>Seeds a minimal Booking row owned by the given agent — for
    /// booking-ownership authorization tests, not the full booking pipeline
    /// (see ProcessB2BBookingTests for that).</summary>
    public static async Task<string> SeedBookingAsync(
        OtaCoreEngineFactory factory, string tenantId, Guid agentId, decimal finalPrice = 500m)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var tenantAccessor = scope.ServiceProvider.GetRequiredService<ITenantAccessor>();
        tenantAccessor.Set(new TenantContext { TenantId = tenantId });

        var pnr = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        db.Bookings.Add(new Booking
        {
            TenantId = tenantId,
            Channel = BookingChannels.B2BAgent,
            Pnr = pnr,
            OfferId = $"offer-{Guid.NewGuid():N}",
            SupplierCode = "SABRE",
            AgentId = agentId,
            Status = BookingStatus.Confirmed,
            SupplierNetRate = finalPrice,
            FinalPrice = finalPrice,
            IdempotencyKey = Guid.NewGuid().ToString(),
        });
        await db.SaveChangesAsync();

        return pnr;
    }

    /// <summary>Re-reads an agent bypassing the tenant query filter — for test
    /// assertions running outside a real request (no ambient ITenantAccessor).
    /// Real cross-tenant-isolation behavior is tested through actual requests
    /// instead (see TenantIsolationTests), not through this helper.</summary>
    public static async Task<Agent> ReloadAgentAsync(OtaCoreEngineFactory factory, Guid agentId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        return await db.Agents.IgnoreQueryFilters().SingleAsync(a => a.Id == agentId);
    }

    public static async Task<List<LedgerEntry>> LedgerForAsync(OtaCoreEngineFactory factory, Guid agentId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        return await db.LedgerEntries.IgnoreQueryFilters().Where(l => l.AgentId == agentId).ToListAsync();
    }

    /// <summary>Creates a scoped service context with a tenant set for service-layer
    /// tests that work directly with DI, bypassing HTTP requests. This ensures
    /// EF Core's global query filters work correctly in the test scope.</summary>
    public static IServiceScope CreateTenantScope(OtaCoreEngineFactory factory, string tenantId)
    {
        var scope = factory.Services.CreateScope();
        var accessor = scope.ServiceProvider.GetRequiredService<ITenantAccessor>();
        accessor.Set(new TenantContext { TenantId = tenantId });
        return scope;
    }
}
