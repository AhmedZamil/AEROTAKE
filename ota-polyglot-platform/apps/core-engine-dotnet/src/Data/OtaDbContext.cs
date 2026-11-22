using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Data;

/// <summary>
/// Multi-tenancy strategy: shared database, shared schema, row-level isolation
/// via a discriminator column (TenantId) enforced by EF global query filters.
/// The filter reads the scoped ITenantAccessor, so every LINQ query is
/// automatically constrained to the caller's tenant — services cannot forget it.
/// </summary>
public class OtaDbContext(DbContextOptions<OtaDbContext> options, ITenantAccessor tenantAccessor)
    : DbContext(options)
{
    private string CurrentTenantId => tenantAccessor.Current?.TenantId ?? string.Empty;

    public DbSet<Agent> Agents => Set<Agent>();
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
    public DbSet<MarkupRule> MarkupRules => Set<MarkupRule>();
    public DbSet<AgentTierProfile> AgentTierProfiles => Set<AgentTierProfile>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentAttempt> PaymentAttempts => Set<PaymentAttempt>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<CustomerWallet> CustomerWallets => Set<CustomerWallet>();
    public DbSet<WalletEntry> WalletEntries => Set<WalletEntry>();
    public DbSet<WalletTopUp> WalletTopUps => Set<WalletTopUp>();
    public DbSet<CancellationRequest> CancellationRequests => Set<CancellationRequest>();
    public DbSet<User> Users => Set<User>();
    public DbSet<UserDevice> UserDevices => Set<UserDevice>();
    public DbSet<VerificationCode> VerificationCodes => Set<VerificationCode>();
    public DbSet<OutboxEvent> OutboxEvents => Set<OutboxEvent>();
    public DbSet<Airport> Airports => Set<Airport>();
    public DbSet<Airline> Airlines => Set<Airline>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerIdentity> CustomerIdentities => Set<CustomerIdentity>();
    public DbSet<GuestClaimToken> GuestClaimTokens => Set<GuestClaimToken>();
    public DbSet<CustomerEmailToken> CustomerEmailTokens => Set<CustomerEmailToken>();
    public DbSet<RevokedToken> RevokedTokens => Set<RevokedToken>();
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<TenantDomain> TenantDomains => Set<TenantDomain>();

    /// <summary>Which module's schema each table lives in (P2-2). One DbContext still, one database: the schemas give every module a
    /// boundary the database itself shows and can enforce (grants, and a later split into separate databases moves whole schemas), and
    /// let a review see at a glance when one module reaches into another's tables. Airports and Airlines are global reference data and stay in public.</summary>
    private static void ConfigureModelSchemas(ModelBuilder b)
    {
        foreach (var (entity, schema) in Schemas.OwnerOf)
        {
            var builder = b.Entity(entity);
            builder.ToTable(builder.Metadata.GetTableName() ?? entity.Name + "s", schema);
        }
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        ConfigureModelSchemas(b);

        b.Entity<Agent>(e =>
        {
            e.Property(x => x.DisplayName).HasMaxLength(200);
            e.Property(x => x.Email).HasMaxLength(320); // RFC 5321 max (64 local + '@' + 255 domain)
            // Explicit DB-level default: the C# `= true` initializer only applies to
            // newly-constructed objects, not to EF's AddColumn migration for existing
            // rows — without this, every pre-existing agency would migrate to inactive.
            e.Property(x => x.IsActive).HasDefaultValue(true);
            e.HasIndex(x => new { x.TenantId, x.Email }).IsUnique();
            e.Property(x => x.CreditLimit).HasPrecision(18, 2);
            e.Property(x => x.CreditUsed).HasPrecision(18, 2);
            // Postgres xmin system column as optimistic concurrency token.
            e.Property(x => x.Version).IsRowVersion();
            e.HasOne(x => x.ParentAgent)
                .WithMany()
                .HasForeignKey(x => x.ParentAgentId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<LedgerEntry>(e =>
        {
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.BalanceAfter).HasPrecision(18, 2);
            e.HasIndex(x => new { x.TenantId, x.AgentId, x.CreatedAt });
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<MarkupRule>(e =>
        {
            e.Property(x => x.MarkupPercent).HasPrecision(6, 4);
            e.Property(x => x.SubAgentDefaultMargin).HasPrecision(18, 2);
            e.Property(x => x.Channel).HasMaxLength(20).IsRequired();
            // One rule per scheme, tier and product. Tier is NULL for consumer rules, and NULLs must count as equal
            // here or two "B2C / any tier / Flight" rules would both be allowed.
            e.HasIndex(x => new { x.TenantId, x.Channel, x.Tier, x.ProductType }).IsUnique().AreNullsDistinct(false);
            e.ToTable(t => t.HasCheckConstraint("CK_MarkupRules_ChannelTier",
                "(\"Channel\" = 'B2C' AND \"Tier\" IS NULL) OR (\"Channel\" = 'B2B_AGENT' AND \"Tier\" IS NOT NULL)"));
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<AgentTierProfile>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(1000);
            // Same treatment as Agent.IsActive: the C# `= true` initializer is
            // invisible to migrations, so this must be explicit or every profile
            // would migrate to disabled.
            e.Property(x => x.IsActive).HasDefaultValue(true);
            e.Property(x => x.IsDefault).HasDefaultValue(false);
            // One profile per tenant per fixed enum slot -- this IS the "no
            // duplicate tier, no arbitrary 5th tier" enforcement.
            e.HasIndex(x => new { x.TenantId, x.Tier }).IsUnique();
            // At most one default profile per tenant.
            e.HasIndex(x => x.TenantId).IsUnique().HasFilter("\"IsDefault\" = TRUE");
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<ExchangeRate>(e =>
        {
            e.Property(x => x.FromCurrency).HasMaxLength(3).IsRequired();
            e.Property(x => x.ToCurrency).HasMaxLength(3).IsRequired();
            e.Property(x => x.Rate).HasPrecision(18, 8);
            e.Property(x => x.Source).HasMaxLength(40).IsRequired();
            // Latest EffectiveFrom wins among overlapping windows; unique on the start keeps accidental duplicates out.
            e.HasIndex(x => new { x.FromCurrency, x.ToCurrency, x.EffectiveFrom }).IsUnique();
            e.ToTable(t => t.HasCheckConstraint("CK_ExchangeRates_Currencies",
                "\"FromCurrency\" = upper(\"FromCurrency\") AND \"ToCurrency\" = upper(\"ToCurrency\") AND \"FromCurrency\" <> \"ToCurrency\" AND \"Rate\" > 0"));
            // Global reference data — no tenant filter (same as Airport/Airline).
        });

        b.Entity<Booking>(e =>
        {
            e.Property(x => x.SupplierNetRate).HasPrecision(18, 2);
            e.Property(x => x.AgentMarkupPercent).HasPrecision(6, 4);
            e.Property(x => x.SubAgentMargin).HasPrecision(18, 2);
            e.Property(x => x.FinalPrice).HasPrecision(18, 2);
            e.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.Pnr });
            e.Property(x => x.Channel).HasMaxLength(20).IsRequired();
            e.Property(x => x.GuestEmail).HasMaxLength(320);
            // No navigation on purpose (bookings and customers are separate concerns); the foreign key keeps CustomerId honest.
            // ClientNoAction, deliberately. For an optional relationship EF otherwise nulls the FK of any TRACKED booking when its
            // customer is removed (observed with both Restrict and NoAction) and then deletes the customer, silently turning an
            // owned booking into an ownerless one. ClientNoAction leaves the booking alone, so the database refuses the delete.
            // (Erasure anonymises a customer; it never deletes one that has bookings.)
            e.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.ClientNoAction);
            // Who-owns-what lookups: an agency's bookings, a customer's bookings.
            e.HasIndex(x => new { x.TenantId, x.AgentId });
            e.HasIndex(x => new { x.TenantId, x.CustomerId });
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_Bookings_Channel", "\"Channel\" IN ('B2B_AGENT','B2B_SUB_AGENT','WHITE_LABEL','B2C')");
                // An agent-channel booking has an agent and no customer; a B2C booking has no agent (or sub-agent).
                t.HasCheckConstraint("CK_Bookings_Owner",
                    "(\"Channel\" <> 'B2C' AND \"AgentId\" IS NOT NULL AND \"CustomerId\" IS NULL) OR " +
                    "(\"Channel\" = 'B2C' AND \"AgentId\" IS NULL AND \"SubAgentId\" IS NULL)");
            });
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<Payment>(e =>
        {
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            e.Property(x => x.Gateway).HasMaxLength(40).IsRequired();
            e.Property(x => x.TranId).HasMaxLength(40).IsRequired();
            e.Property(x => x.GatewayRef).HasMaxLength(80);
            e.HasIndex(x => new { x.TenantId, x.TranId }).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.BookingId });
            e.HasOne<Booking>().WithMany().HasForeignKey(x => x.BookingId).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint("CK_Payments_Gateway", "\"Gateway\" IN ('sslcommerz','wallet')"));
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<PaymentAttempt>(e =>
        {
            e.Property(x => x.IdempotencyKey).HasMaxLength(100).IsRequired();
            e.Property(x => x.SessionKey).HasMaxLength(80);
            e.Property(x => x.GatewayPageUrl).HasMaxLength(500);
            e.Property(x => x.FailureReason).HasMaxLength(200);
            e.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique();
            e.HasIndex(x => x.PaymentId);
            e.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<Refund>(e =>
        {
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            e.Property(x => x.GatewayRef).HasMaxLength(80);
            e.Property(x => x.Reason).HasMaxLength(200);
            e.HasIndex(x => x.PaymentId);
            e.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<CustomerWallet>(e =>
        {
            e.Property(x => x.Balance).HasPrecision(18, 2);
            e.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            e.HasIndex(x => new { x.TenantId, x.CustomerId }).IsUnique();
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<WalletEntry>(e =>
        {
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.BalanceAfter).HasPrecision(18, 2);
            e.Property(x => x.Kind).HasMaxLength(10).IsRequired();
            e.Property(x => x.Note).HasMaxLength(200);
            e.HasIndex(x => new { x.TenantId, x.CustomerId, x.CreatedAt });
            e.ToTable(t => t.HasCheckConstraint("CK_WalletEntries_Kind", "\"Kind\" IN ('credit','debit')"));
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<WalletTopUp>(e =>
        {
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            e.Property(x => x.Gateway).HasMaxLength(40).IsRequired();
            e.Property(x => x.TranId).HasMaxLength(40).IsRequired();
            e.Property(x => x.GatewayRef).HasMaxLength(80);
            e.Property(x => x.GatewayPageUrl).HasMaxLength(500);
            e.Property(x => x.IdempotencyKey).HasMaxLength(100).IsRequired();
            e.HasIndex(x => x.TranId).IsUnique();
            e.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique();
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<CancellationRequest>(e =>
        {
            e.Property(x => x.CustomerNote).HasMaxLength(500);
            e.Property(x => x.OpsNote).HasMaxLength(500);
            e.HasIndex(x => x.BookingId);
            e.HasIndex(x => new { x.TenantId, x.BookingId, x.Status });
            e.HasOne<Booking>().WithMany().HasForeignKey(x => x.BookingId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Refund>().WithMany().HasForeignKey(x => x.RefundId).OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<User>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.Email }).IsUnique();
            e.HasOne(x => x.Agent)
                .WithMany()
                .HasForeignKey(x => x.AgentId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<UserDevice>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.DeviceToken }).IsUnique();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<VerificationCode>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.Purpose, x.ConsumedAt });
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<OutboxEvent>(e =>
        {
            e.Property(x => x.Topic).HasMaxLength(200);
            e.Property(x => x.Key).HasMaxLength(400);
            // Polling reads "WHERE ProcessedAt IS NULL" — a partial index keeps
            // that query cheap regardless of how many processed rows accumulate.
            e.HasIndex(x => x.ProcessedAt).HasFilter("\"ProcessedAt\" IS NULL");
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<Airport>(e =>
        {
            e.Property(x => x.IataCode).HasMaxLength(3).IsRequired();
            e.Property(x => x.IcaoCode).HasMaxLength(4);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.City).HasMaxLength(200);
            e.Property(x => x.Country).HasMaxLength(100);
            e.HasIndex(x => x.IataCode).IsUnique();
            // No HasQueryFilter here, unlike every entity above — airports are
            // global reference data shared by every tenant, not tenant-scoped.
        });

        b.Entity<Airline>(e =>
        {
            e.Property(x => x.IataCode).HasMaxLength(2).IsRequired();
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.LogoUrl).HasMaxLength(500);
            e.HasIndex(x => x.IataCode).IsUnique();
            // Same rationale as Airport — global reference data, no tenant filter.
        });

        b.Entity<Customer>(e =>
        {
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.FirstName).HasMaxLength(100);
            e.Property(x => x.LastName).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(30);
            // Per tenant, because an account belongs to one brand. NULLs (no email) are allowed to repeat.
            e.HasIndex(x => new { x.TenantId, x.Email }).IsUnique();
            e.ToTable(t => t.HasCheckConstraint("CK_Customers_EmailLowercase", "\"Email\" IS NULL OR \"Email\" = lower(trim(\"Email\"))"));
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<CustomerIdentity>(e =>
        {
            e.Property(x => x.Provider).HasMaxLength(20).IsRequired();
            e.Property(x => x.ProviderSubject).HasMaxLength(255).IsRequired();
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.PasswordHash).HasMaxLength(100);
            // The same provider account on two brands is two customers, so uniqueness is per tenant.
            e.HasIndex(x => new { x.TenantId, x.Provider, x.ProviderSubject }).IsUnique();
            e.HasIndex(x => x.CustomerId);
            e.HasOne(x => x.Customer).WithMany(c => c.Identities).HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_CustomerIdentities_Provider", "\"Provider\" IN ('google','facebook','password')");
                // A password login has a hash; a social one never does.
                t.HasCheckConstraint("CK_CustomerIdentities_PasswordHash", "(\"Provider\" = 'password') = (\"PasswordHash\" IS NOT NULL)");
            });
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<RevokedToken>(e =>
        {
            e.HasKey(x => x.TokenId);
            e.Property(x => x.TokenId).HasMaxLength(100);
            e.HasIndex(x => x.ExpiresAt); // for the cleanup sweep
        });

        b.Entity<CustomerEmailToken>(e =>
        {
            e.Property(x => x.Purpose).HasMaxLength(10).IsRequired();
            e.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.CustomerId);
            e.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_CustomerEmailTokens_Purpose", "\"Purpose\" IN ('verify','reset')");
                t.HasCheckConstraint("CK_CustomerEmailTokens_HashFormat", "\"TokenHash\" ~ '^[0-9a-f]{64}$'");
            });
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<GuestClaimToken>(e =>
        {
            e.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.BookingId);
            e.HasOne<Booking>().WithMany().HasForeignKey(x => x.BookingId).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t => t.HasCheckConstraint("CK_GuestClaimTokens_HashFormat", "\"TokenHash\" ~ '^[0-9a-f]{64}$'"));
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        // Tenant registry: control-plane data, global on purpose (no query filter) —
        // see the Tenant entity's doc comment.
        b.Entity<Tenant>(e =>
        {
            e.HasKey(x => x.TenantId);
            e.Property(x => x.TenantId).HasMaxLength(100);
            e.Property(x => x.DisplayName).HasMaxLength(200).IsRequired();
            e.Property(x => x.SellCurrency).HasMaxLength(3).IsRequired();
            e.Property(x => x.IsActive).HasDefaultValue(true);
        });

        b.Entity<TenantDomain>(e =>
        {
            e.Property(x => x.Host).HasMaxLength(253).IsRequired();
            e.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            e.Property(x => x.Channel).HasMaxLength(20).IsRequired();
            e.Property(x => x.BrandName).HasMaxLength(200).IsRequired();
            e.Property(x => x.LogoUrl).HasMaxLength(500).IsRequired();
            e.Property(x => x.PrimaryColor).HasMaxLength(20).IsRequired();
            e.Property(x => x.AccentColor).HasMaxLength(20).IsRequired();
            e.Property(x => x.MarkupProfile).HasMaxLength(100).IsRequired();
            e.Property(x => x.IsActive).HasDefaultValue(true);
            e.HasIndex(x => x.Host).IsUnique();
            e.HasOne(x => x.Tenant).WithMany(t => t.Domains).HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_TenantDomains_Channel", "\"Channel\" IN ('B2C','B2B_AGENT','B2B_SUB_AGENT','WHITE_LABEL')");
                t.HasCheckConstraint("CK_TenantDomains_HostLowercase", "\"Host\" = lower(\"Host\")");
            });
        });
    }
}

public static class DbSeeder
{
    /// <summary>Dev-only seed: one demo tenant, one gold agency + sub-agent, markup
    /// rules, and a demo login user (see the credentials logged below) so the
    /// Postman collection has something to log in with out of the box.</summary>
    public static async Task SeedAsync(OtaDbContext db, Auth.IPasswordHasher passwordHasher, ILogger logger, CancellationToken ct = default)
    {
        // Schema bootstrap (migrations) is owned by Program.cs.
        // Seed queries must ignore the tenant filter — there is no ambient tenant here.
        if (await db.Agents.IgnoreQueryFilters().AnyAsync(ct)) return;

        const string tenant = "demo-tenant";
        var agency = new Agent
        {
            TenantId = tenant,
            DisplayName = "SkyBridge Travels",
            Email = "ops@skybridge.example",
            Tier = AgentTier.Gold,
            CreditLimit = 50_000m
        };
        var subAgent = new Agent
        {
            TenantId = tenant,
            DisplayName = "SkyBridge — Chittagong Desk",
            Email = "ctg@skybridge.example",
            Tier = AgentTier.Standard,
            CreditLimit = 5_000m,
            ParentAgent = agency
        };

        db.Agents.AddRange(agency, subAgent);
        db.MarkupRules.AddRange(
            new MarkupRule { TenantId = tenant, Tier = AgentTier.Standard, MarkupPercent = 0.10m, SubAgentDefaultMargin = 15m },
            new MarkupRule { TenantId = tenant, Tier = AgentTier.Silver,   MarkupPercent = 0.08m, SubAgentDefaultMargin = 12m },
            new MarkupRule { TenantId = tenant, Tier = AgentTier.Gold,     MarkupPercent = 0.06m, SubAgentDefaultMargin = 10m },
            new MarkupRule { TenantId = tenant, Tier = AgentTier.Platinum, MarkupPercent = 0.04m, SubAgentDefaultMargin = 8m },
            // Consumer pricing starts out the same as Standard, which is how logged-out visitors were priced before B2C
            // had its own rules; an admin changes it independently.
            new MarkupRule { TenantId = tenant, Channel = MarkupChannels.B2C, Tier = null, MarkupPercent = 0.10m, SubAgentDefaultMargin = 15m });
        db.AgentTierProfiles.AddRange(
            new AgentTierProfile { TenantId = tenant, Tier = AgentTier.Standard, Name = "Standard", IsDefault = true },
            new AgentTierProfile { TenantId = tenant, Tier = AgentTier.Silver,   Name = "Silver" },
            new AgentTierProfile { TenantId = tenant, Tier = AgentTier.Gold,     Name = "Gold" },
            new AgentTierProfile { TenantId = tenant, Tier = AgentTier.Platinum, Name = "Platinum" });

        const string demoPassword = "Passw0rd!";
        var demoUser = new User
        {
            TenantId = tenant,
            Email = "demo@skybridge.example",
            PasswordHash = passwordHasher.Hash(demoPassword),
            FirstName = "Demo",
            LastName = "Agent",
            Role = UserRole.AgencyAdmin,
            EmailVerified = true,
            Agent = agency,
        };
        db.Users.Add(demoUser);

        var platformAdmin = new User
        {
            TenantId = tenant,
            Email = PlatformAdminSeeder.DemoTenantAdminEmail,
            PasswordHash = passwordHasher.Hash(PlatformAdminSeeder.Password),
            FirstName = "Platform",
            LastName = "Admin",
            Role = UserRole.Admin,
            AgentId = null,
            EmailVerified = true,
            IsActive = true,
        };
        db.Users.Add(platformAdmin);
        db.UserDevices.Add(new UserDevice
        {
            TenantId = tenant,
            User = platformAdmin,
            DeviceToken = PlatformAdminSeeder.DeviceToken,
        });

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded demo tenant '{Tenant}' with agency {AgencyId}", tenant, agency.Id);
        logger.LogInformation("Demo login: demo@skybridge.example / {Password} (tenant: {Tenant})", demoPassword, tenant);
        logger.LogInformation("PlatformAdmin login: {Email} / {Password} (tenant: {Tenant}, deviceToken: {DeviceToken})",
            PlatformAdminSeeder.DemoTenantAdminEmail, PlatformAdminSeeder.Password, tenant, PlatformAdminSeeder.DeviceToken);
    }
}

/// <summary>One-time load of the global airport directory (IATA/ICAO reference data)
/// that powers the search panel's From/To typeahead. Unlike DbSeeder, this runs in
/// every environment (it's reference data every tenant needs, not demo data) and is
/// gated purely on the table being empty, so it's a no-op on every restart after the
/// first.</summary>
public static class AirportSeeder
{
    public static async Task SeedAsync(OtaDbContext db, ILogger logger, CancellationToken ct = default)
    {
        if (await db.Airports.AnyAsync(ct)) return;

        var csvPath = Path.Combine(AppContext.BaseDirectory, "Data", "Seed", "airports.csv");
        if (!File.Exists(csvPath))
        {
            logger.LogWarning("Airport seed file not found at {Path} — skipping airport seeding.", csvPath);
            return;
        }

        var airports = new List<Airport>();
        using (var reader = new StreamReader(csvPath))
        {
            var header = await reader.ReadLineAsync(ct);
            string? line;
            while ((line = await reader.ReadLineAsync(ct)) is not null)
            {
                if (line.Length == 0) continue;
                var fields = ParseCsvLine(line);
                if (fields.Count < 7) continue;

                airports.Add(new Airport
                {
                    IataCode = fields[0],
                    IcaoCode = string.IsNullOrEmpty(fields[1]) ? null : fields[1],
                    Name = fields[2],
                    City = fields[3],
                    Country = fields[4],
                    Latitude = double.TryParse(fields[5], NumberStyles.Float, CultureInfo.InvariantCulture, out var lat) ? lat : null,
                    Longitude = double.TryParse(fields[6], NumberStyles.Float, CultureInfo.InvariantCulture, out var lon) ? lon : null,
                });
            }
        }

        db.Airports.AddRange(airports);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} airports from {Path}", airports.Count, csvPath);
    }

    // Minimal RFC 4180 line parser (quoted fields, embedded commas, doubled-quote
    // escaping) — sufficient for the single-line-per-row seed file generated for
    // this table; no embedded newlines occur within any field here. Internal
    // (not private) so AirlineSeeder below can reuse it instead of duplicating.
    internal static List<string> ParseCsvLine(string line)
    {
        var fields = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < line.Length && line[i + 1] == '"')
                {
                    field.Append('"');
                    i++;
                }
                else if (c == '"')
                {
                    inQuotes = false;
                }
                else
                {
                    field.Append(c);
                }
            }
            else if (c == '"')
            {
                inQuotes = true;
            }
            else if (c == ',')
            {
                fields.Add(field.ToString());
                field.Clear();
            }
            else
            {
                field.Append(c);
            }
        }
        fields.Add(field.ToString());
        return fields;
    }
}

/// <summary>One-time load of the global airline directory (IATA reference data)
/// that powers the search panel's "Preferred Airline" filter. Same rationale as
/// AirportSeeder — runs in every environment, no-ops once the table is populated.</summary>
public static class AirlineSeeder
{
    public static async Task SeedAsync(OtaDbContext db, ILogger logger, CancellationToken ct = default)
    {
        if (await db.Airlines.AnyAsync(ct)) return;

        var csvPath = Path.Combine(AppContext.BaseDirectory, "Data", "Seed", "airlines.csv");
        if (!File.Exists(csvPath))
        {
            logger.LogWarning("Airline seed file not found at {Path} — skipping airline seeding.", csvPath);
            return;
        }

        var airlines = new List<Airline>();
        using (var reader = new StreamReader(csvPath))
        {
            var header = await reader.ReadLineAsync(ct);
            string? line;
            while ((line = await reader.ReadLineAsync(ct)) is not null)
            {
                if (line.Length == 0) continue;
                var fields = AirportSeeder.ParseCsvLine(line);
                if (fields.Count < 3) continue;

                airlines.Add(new Airline
                {
                    IataCode = fields[0],
                    Name = fields[1],
                    LogoUrl = string.IsNullOrEmpty(fields[2]) ? null : fields[2],
                });
            }
        }

        db.Airlines.AddRange(airlines);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} airlines from {Path}", airlines.Count, csvPath);
    }
}
