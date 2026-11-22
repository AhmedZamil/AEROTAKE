using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Ledger;
using Ota.CoreEngine.Messaging;
using Ota.CoreEngine.Observability;
using Ota.CoreEngine.RateLimiting;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Payments;
using Ota.CoreEngine.Pricing;
using Ota.CoreEngine.Search;
using Ota.CoreEngine.Suppliers;
using Ota.CoreEngine.Tenancy;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Kestrel: HTTP/1.1 (REST + health) on 8080, HTTP/2 (gRPC) on 8081.
// ---------------------------------------------------------------------------
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ListenAnyIP(8080, o => o.Protocols = HttpProtocols.Http1);
    kestrel.ListenAnyIP(8081, o => o.Protocols = HttpProtocols.Http2);
});

// ------------------------------ Tenancy ------------------------------------
builder.Services.AddScoped<ITenantAccessor, TenantAccessor>();

// ------------------------------ Persistence --------------------------------
var connectionString = builder.Configuration.GetConnectionString("Postgres")
    ?? "Host=localhost;Port=5432;Database=ota;Username=ota;Password=ota";

builder.Services.AddDbContext<OtaDbContext>(o =>
    o.UseNpgsql(connectionString, npgsql => npgsql.EnableRetryOnFailure(5)));

// ------------------------------ Redis --------------------------------------
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(
        builder.Configuration.GetValue<string>("Redis:ConnectionString") ?? "localhost:6379,abortConnect=false"));

// ------------------------------ Domain services ----------------------------
builder.Services.AddSingleton<IPricingCalculator, PricingCalculator>();
builder.Services.AddScoped<ICurrencyConversion, CurrencyConversion>();
builder.Services.AddScoped<IAgentCreditService, AgentCreditService>();
// Scoped (not singleton) so it shares the same OtaDbContext instance as the
// gRPC call that constructed it — see OutboxBookingEventProducer's doc comment.
builder.Services.AddScoped<IBookingEventProducer, OutboxBookingEventProducer>();
builder.Services.AddSingleton<IOfferOwnership, RedisOfferOwnership>();
builder.Services.AddSingleton<IOfferSnapshots, RedisOfferSnapshots>();
builder.Services.AddSingleton<IRateLimiter, RedisRateLimiter>();
builder.Services.AddSingleton<IAbuseGuard, AbuseGuard>();
// Core sits behind the storefronts' servers, so the TCP peer is always one of them. The real client address is what they put in
// X-Forwarded-For — believed ONLY when the peer is a trusted proxy network, so a caller cannot dodge per-IP limits by inventing the header.
builder.Services.Configure<Microsoft.AspNetCore.Builder.ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor;
    o.ForwardLimit = 1;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
    var configured = builder.Configuration["TRUSTED_PROXY_NETWORKS"] ?? "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16";
    foreach (var cidr in configured.Split([',', ' ', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(cidr));
});
builder.Services.AddScoped<IStorefrontTenants, StorefrontTenants>();
builder.Services.AddScoped<IMarkupResolver, MarkupResolver>();
builder.Services.AddScoped<ISearchService, SearchService>();
builder.Services.AddScoped<IBookingService, BookingService>();
builder.Services.AddScoped<IConsumerBookingService, ConsumerBookingService>();
builder.Services.AddScoped<IBookingEmailService, BookingEmailService>();
builder.Services.AddScoped<IPaidBookingCompleter, PaidBookingCompleter>();
builder.Services.AddScoped<IHoldExpiryService, HoldExpiryService>();
builder.Services.AddHostedService<HoldExpiryJob>();
builder.Services.AddScoped<IHoldReminderService, HoldReminderService>();
builder.Services.AddHostedService<HoldReminderJob>();
builder.Services.AddScoped<IPaymentReconciliationService, PaymentReconciliationService>();
builder.Services.AddHostedService<PaymentReconciliationJob>();
builder.Services.AddScoped<IGuestAccessService, GuestAccessService>();
builder.Services.AddScoped<IBookingCancellationService, BookingCancellationService>();
builder.Services.AddScoped<IGrpcCallerResolver, GrpcCallerResolver>();

// ------------------------------ Payments (SSLCommerz) -----------------------
builder.Services.Configure<SslCommerzOptions>(o =>
{
    var cfg = builder.Configuration;
    o.StoreId = cfg["SSLCOMMERZ_STORE_ID"] ?? cfg["SslCommerz:StoreId"] ?? "";
    o.StorePassword = cfg["SSLCOMMERZ_STORE_PASSWORD"] ?? cfg["SslCommerz:StorePassword"] ?? "";
    o.IsSandbox = !string.Equals(cfg["SSLCOMMERZ_IS_SANDBOX"] ?? cfg["SslCommerz:IsSandbox"] ?? "true", "false", StringComparison.OrdinalIgnoreCase);
    o.StorefrontPublicUrl = cfg["SSLCOMMERZ_STOREFRONT_PUBLIC_URL"] ?? cfg["SslCommerz:StorefrontPublicUrl"] ?? cfg["STOREFRONT_PUBLIC_URL"];
    o.CorePublicUrl = cfg["SSLCOMMERZ_CORE_PUBLIC_URL"] ?? cfg["SslCommerz:CorePublicUrl"];
});
builder.Services.AddHttpClient("sslcommerz", c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddScoped<IPaymentGateway, SslCommerzGateway>();
builder.Services.AddScoped<IWalletService, WalletService>();
builder.Services.AddScoped<IWalletTopUpService, WalletTopUpService>();
builder.Services.AddScoped<IPaymentService, PaymentService>();

// ------------------------------ Auth ----------------------------------------
builder.Services.AddSingleton<IPasswordHasher, BCryptPasswordHasher>();
// Resolved from DI (not read into a local here) so it sees the fully merged configuration —
// WebApplicationFactory adds its overrides after this top-level code runs.
builder.Services.AddSingleton<IJwtKeyRing>(sp =>
{
    var cfg = sp.GetRequiredService<IConfiguration>();
    var env = sp.GetRequiredService<IHostEnvironment>();
    var log = sp.GetRequiredService<ILogger<JwtKeyRing>>();

    var json = cfg["JWT_SIGNING_KEYS"];
    JwtKeyRing ring;
    if (!string.IsNullOrWhiteSpace(json))
    {
        ring = JwtKeyRing.FromJson(json);
    }
    else if (env.IsDevelopment())
    {
        ring = JwtKeyRing.Ephemeral([TokenAudiences.Agents, TokenAudiences.Customers, TokenAudiences.Internal]);
        log.LogWarning("JWT_SIGNING_KEYS is not set: generated EPHEMERAL signing keys. Every session stops working when " +
                       "core-engine restarts. Run scripts/generate-jwt-keys.sh --write-env for stable local keys.");
    }
    else
    {
        throw new InvalidOperationException("JWT_SIGNING_KEYS is not configured. Generate keys with scripts/generate-jwt-keys.sh.");
    }
    log.LogInformation("JWT signing keys loaded (ES256). Active: {Keys}", string.Join(", ", ring.ActiveKeyIds));
    return ring;
});
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<IDeviceVerificationService, DeviceVerificationService>();

// Frontends that may exchange client credentials for service tokens. Empty (with a warning) when unset:
// anonymous gRPC search/revalidate then fails closed instead of falling back to open access.
builder.Services.AddSingleton<IServiceClientRegistry>(sp =>
{
    var json = sp.GetRequiredService<IConfiguration>()["SERVICE_CLIENTS"];
    if (string.IsNullOrWhiteSpace(json))
    {
        sp.GetRequiredService<ILogger<ServiceClientRegistry>>().LogWarning(
            "SERVICE_CLIENTS is not set: no frontend can obtain a service token, so anonymous gRPC search is refused. " +
            "Run scripts/generate-service-clients.sh --write-env.");
        return ServiceClientRegistry.Empty;
    }
    return ServiceClientRegistry.FromJson(json);
});

// Customer (B2C) sign-in. Providers are registered by what they need; Google stays "not configured" (sign-in answers 503)
// until GOOGLE_CLIENT_IDS names at least one OAuth client id.
builder.Services.AddSingleton<IExternalIdentityVerifier>(sp => GoogleIdentityVerifier.Create(sp.GetRequiredService<IConfiguration>()["GOOGLE_CLIENT_IDS"]));
builder.Services.AddSingleton<IExternalIdentityVerifier>(sp => FacebookIdentityVerifier.Create(sp.GetRequiredService<IConfiguration>()["FACEBOOK_APP_IDS"]));
builder.Services.AddScoped<ICustomerSignInService, CustomerSignInService>();
builder.Services.AddScoped<ICustomerPasswordService, CustomerPasswordService>();
builder.Services.AddHttpClient("turnstile");
builder.Services.AddSingleton<ICaptchaVerifier, TurnstileVerifier>();
builder.Services.AddSingleton<ICustomerTokenService, CustomerTokenService>();
builder.Services.AddScoped<ICustomerSessions, CustomerSessions>();
builder.Services.AddHostedService<ExpiredRevocationsSweeper>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer()
    .AddGrpcBearer()
    .AddCustomerBearer();
builder.Services.ConfigureGrpcBearer();
builder.Services.ConfigureCustomerBearer();

// JwtBearerOptions is configured through DI (Configure<...>) so the key ring comes from the container.
// Keys are chosen by the audience and kid the token names, only ES256 is accepted (never an algorithm
// taken from the token), and only the Agents audience reaches the API — see TokenAudiences.
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IConfiguration, IJwtKeyRing>((o, config, keys) =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = config["Jwt:Issuer"] ?? "ota-core-engine",
            ValidAudience = TokenAudiences.Agents,
            IssuerSigningKeyResolver = (_, token, kid, _) => JwtKeyRing.Resolve(keys, token, kid),
            ValidAlgorithms = [JwtKeyRing.Algorithm],
            RequireSignedTokens = true,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            // RoleClaimType deliberately left at its default (ClaimTypes.Role):
            // the JwtBearer pipeline's inbound claim mapping already rewrites
            // JwtTokenService's plain "role" claim to that same URI before
            // [Authorize(Roles=...)]/User.IsInRole() ever see it (verified via
            // OnTokenValidated claim dump — do not "fix" this by setting
            // RoleClaimType="role", that points at the pre-mapping name and
            // breaks every role check with a silent 403).
        };
        o.Events = new JwtBearerEvents
        {
            // A refresh token presented as an access token must be rejected —
            // otherwise a long-lived refresh token becomes a de facto
            // never-expiring access token.
            OnTokenValidated = context =>
            {
                var tokenType = context.Principal?.FindFirst("token_type")?.Value;
                if (tokenType != "access") context.Fail("Not an access token.");
                // A token missing the claims every request depends on is MALFORMED — an authentication failure (401), not a
                // permissions one (403) — so it is refused here, where authentication happens, rather than left for a policy.
                else if (context.Principal?.FindFirst(ActorTypes.ClaimName)?.Value != ActorTypes.Agent) context.Fail("Not an agent token.");
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization(o => o.AddGrpcPolicies().AddCustomerPolicies().AddRestPolicies());

// ------------------------------ Suppliers (GDS) -----------------------------
// See GdsResilienceExtensions for why read (search/revalidate/token) and
// transactional (PNR create/ticket issue) calls get different retry policy —
// the latter must never be blindly retried (risk of a duplicate PNR/ticket).
// Sabre answers in 3-5 s. One attempt that stalls on a dead connection is cut off after 8 s and retried, twice, inside the search limit.
builder.Services.AddHttpClient("sabre").AddFreshConnections().AddGdsReadResilience(perAttempt: TimeSpan.FromSeconds(8), total: TimeSpan.FromSeconds(24), maxRetries: 2);
builder.Services.AddHttpClient("sabre-booking").AddFreshConnections().AddGdsTransactionalResilience();
builder.Services.AddSingleton<ISabreTokenService, SabreTokenService>();
// Hajee's search is slow (8-20 s a page in pre-production) and is asked for on its own, with its own long time limit (speed=slow): one
// attempt may take up to 40 s, and it is not retried, because a second 40 s attempt could never finish inside the limit anyway.
builder.Services.AddHttpClient("hajee").AddFreshConnections().AddGdsReadResilience(perAttempt: TimeSpan.FromSeconds(40), total: TimeSpan.FromSeconds(50), maxRetries: 1);
builder.Services.AddHttpClient("hajee-booking").AddFreshConnections().AddGdsTransactionalResilience();
builder.Services.AddSingleton<IHajeeTokenService, HajeeTokenService>();
builder.Services.AddSingleton<ISupplierProvider>(sp =>
{
    var cfg = sp.GetRequiredService<IConfiguration>();
    var log = sp.GetRequiredService<ILogger<Program>>();
    var providers = new List<ISupplierProvider>();

    if (!string.IsNullOrWhiteSpace(cfg["SABRE_JV_CLIENT_ID"]) && !string.IsNullOrWhiteSpace(cfg["SABRE_JV_CLIENT_SECRET"]))
    {
        providers.Add(new SabreProvider(
            sp.GetRequiredService<IHttpClientFactory>(),
            sp.GetRequiredService<ISabreTokenService>(),
            sp.GetRequiredService<IConnectionMultiplexer>(),
            cfg,
            sp.GetRequiredService<ILogger<SabreProvider>>()));
    }
    else
    {
        log.LogWarning("SABRE_JV_CLIENT_ID/SECRET not configured — Sabre disabled.");
    }

    if (HajeeConfig.IsConfigured(cfg))
    {
        providers.Add(new HajeeAirProvider(
            sp.GetRequiredService<IHttpClientFactory>(),
            sp.GetRequiredService<IHajeeTokenService>(),
            sp.GetRequiredService<IConnectionMultiplexer>(),
            cfg,
            sp.GetRequiredService<ILogger<HajeeAirProvider>>()));
    }
    else
    {
        log.LogWarning("Hajee Air disabled: HAJEE_API_BASE_URL (must be https://), HAJEE_API_ACCESS_KEY and HAJEE_CLIENT_ID are all required.");
    }

    if (providers.Count == 0)
    {
        log.LogWarning("No real supplier configured — falling back to SupplierStubProvider.");
        return new SupplierStubProvider();
    }

    log.LogInformation("Suppliers enabled: {Suppliers}", string.Join(", ", providers.Select(p => p.SupplierCode)));
    return new CompositeSupplierProvider(
        providers,
        new RedisOfferAlternatesReader(sp.GetRequiredService<IConnectionMultiplexer>()),
        sp.GetRequiredService<ILogger<CompositeSupplierProvider>>());
});

// ------------------------------ Observability / alerting -------------------
builder.Services.AddHttpClient("alerts");
builder.Services.AddSingleton<IAlertNotifier, AlertNotifier>();
builder.Services.AddSingleton<AlertingInterceptor>();
builder.Services.AddSingleton<ServiceExceptionInterceptor>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

// ------------------------------ Transport ----------------------------------
builder.Services.AddGrpc(o =>
{
    o.EnableDetailedErrors = builder.Environment.IsDevelopment();
    o.Interceptors.Add<AlertingInterceptor>();
    // Inside the alerting one: it must see the mapped RpcException (an expected outcome), not the raw ServiceException.
    o.Interceptors.Add<ServiceExceptionInterceptor>();
});
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks().AddDbContextCheck<OtaDbContext>("postgres");

var app = builder.Build();

// ------------------------------ Startup tasks ------------------------------
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var notifier = scope.ServiceProvider.GetRequiredService<IAlertNotifier>();

    if (builder.Configuration.GetValue("Database:AutoMigrate", true))
    {
        try
        {
            // Applies any pending migrations, including creating the full schema
            // from scratch on a brand-new database. No-op if already up to date.
            // Migration history is tracked in __EFMigrationsHistory, replacing
            // EnsureCreated's untracked, non-reviewable schema creation.
            await db.Database.MigrateAsync();
        }
        catch (Exception ex)
        {
            logger.LogCritical(ex, "Database migration failed — refusing to start with a schema that may be missing or out of date.");
            await notifier.NotifyAsync("core-engine failed to apply database migrations", ex);
            throw; // fail fast: never serve traffic against an unmigrated/broken schema.
        }
    }

    try
    {
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        await DbSeeder.SeedAsync(db, hasher, logger);
    }
    catch (Exception ex)
    {
        // Demo/operational-data problem, not a schema-safety problem — keep
        // the swallow-and-alert behavior so a seed hiccup doesn't take down
        // an otherwise correctly-migrated service.
        logger.LogError(ex, "Database seeding failed — service will start but demo data may be missing.");
        await notifier.NotifyAsync("core-engine failed to seed its database", ex);
    }

    if (builder.Environment.IsDevelopment())
    {
        try
        {
            await TenantRegistrySeeder.SeedAsync(db, logger);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Tenant registry seeding failed — localhost may not resolve to a tenant in the frontend.");
            await notifier.NotifyAsync("core-engine failed to seed the tenant registry", ex);
        }

        try
        {
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            await PlatformAdminSeeder.SeedAsync(db, hasher, logger);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "PlatformAdmin seeding failed — markup/FX admin Postman flows need a seeded Admin user.");
            await notifier.NotifyAsync("core-engine failed to seed PlatformAdmin users", ex);
        }
    }

    try
    {
        // Global reference data, not demo data — runs in every environment, not
        // just Development, and is separately guarded so a hiccup here can't
        // prevent the tenant demo seed above from having already succeeded.
        await AirportSeeder.SeedAsync(db, logger);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Airport directory seeding failed — service will start but the search panel's airport list may be empty.");
        await notifier.NotifyAsync("core-engine failed to seed the airport directory", ex);
    }

    try
    {
        await AirlineSeeder.SeedAsync(db, logger);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Airline directory seeding failed — service will start but the search panel's Preferred Airline list may be empty.");
        await notifier.NotifyAsync("core-engine failed to seed the airline directory", ex);
    }

    try
    {
        // FX table (P4-10): supplier currency → tenant SellCurrency. Placeholder rates until ops replace them.
        await ExchangeRateSeeder.SeedAsync(db, logger);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Exchange-rate seeding failed — searches that need FX will refuse until rates exist.");
        await notifier.NotifyAsync("core-engine failed to seed exchange rates", ex);
    }
}

// ------------------------------ Pipeline -----------------------------------
app.UseForwardedHeaders(); // first: everything after (rate limits, logging) sees the real client address
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantResolutionMiddleware>();

app.MapHealthChecks("/healthz").AllowAnonymous();
// Public verification keys for the frontends (no private material). Anonymous and exempt from tenant
// resolution: a frontend needs it before it can verify anyone's token.
app.MapGet("/.well-known/jwks.json", (IJwtKeyRing keys, HttpContext http) =>
{
    http.Response.Headers.CacheControl = "public, max-age=300";
    return Results.Json(keys.PublicJwks());
}).AllowAnonymous();
app.MapControllers();
app.MapGrpcService<OtaCoreGrpcService>();
app.MapGet("/", () => Results.Json(new
{
    service = "ota-core-engine",
    grpc = "port 8081 (h2c)",
    rest = "port 8080",
    docs = "/swagger"
})).AllowAnonymous();

app.Run();

// Makes the implicit Program class referenceable from
// WebApplicationFactory<Program> in the test project. No behavior change.
public partial class Program { }
