using Grpc.Net.Client;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Observability;

namespace Ota.CoreEngine.Tests.Fixtures;

/// <summary>Points the app at ephemeral Testcontainers Postgres/Redis instead
/// of the real docker-compose services, and swaps the real IAlertNotifier for
/// a recording fake. Also provides helpers for creating authenticated HTTP
/// clients with JWT tokens for testing protected endpoints.</summary>
public sealed class OtaCoreEngineFactory(
    string postgresConnectionString,
    string redisConnectionString,
    FakeAlertNotifier alertNotifier)
    : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) =>
        {
            var overrides = new Dictionary<string, string?>
            {
                ["ConnectionStrings:Postgres"] = postgresConnectionString,
                ["Redis:ConnectionString"] = redisConnectionString,
                ["JWT_SIGNING_KEYS"] = TestJwtKeys.ConfigJson,
                ["SERVICE_CLIENTS"] = TestServiceClients.ConfigJson,
                // Limits are off for the general suite (hundreds of requests share one address); RateLimitingTests turns them on.
                ["RateLimiting:Enabled"] = "false",
                // Hold expiry is exercised directly in HoldExpiryTests; the background job would race shared-DB leftovers.
                ["B2C:HoldExpiryEnabled"] = "false",
                // Reconciliation is exercised directly in PaymentReconciliationTests.
                ["B2C:ReconciliationEnabled"] = "false",
                // Each host gets its own availability-cache namespace so a stub search cannot satisfy a later test's fake supplier.
                ["Search:CacheSalt"] = Guid.NewGuid().ToString("N"),
            };

            config.AddInMemoryCollection(overrides);
        });

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAlertNotifier>();
            services.AddSingleton<IAlertNotifier>(alertNotifier);
        });
    }

    /// <summary>Creates an HTTP client with a JWT Bearer token in the Authorization
    /// header for testing protected endpoints.</summary>
    public HttpClient CreateAuthenticatedClient(string accessToken)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("Authorization", $"Bearer {accessToken}");
        return client;
    }

    /// <summary>gRPC channel over the in-memory TestServer. The
    /// ResponseVersionHandler is the standard documented workaround —
    /// TestServer's HttpClient doesn't set response.Version, which
    /// GrpcChannel requires to recognize the connection as HTTP/2.</summary>
    public GrpcChannel CreateGrpcChannel(string? bearerToken = null) => GrpcChannelFor(this, bearerToken);

    /// <summary>Same as <see cref="CreateGrpcChannel"/> for any factory derived from this one
    /// (WithWebHostBuilder returns a plain WebApplicationFactory), e.g. one with a supplier swapped in.</summary>
    public static GrpcChannel GrpcChannelFor(WebApplicationFactory<Program> factory, string? bearerToken = null)
    {
        var handlers = new List<DelegatingHandler>();
        if (bearerToken is not null) handlers.Add(new BearerHandler(bearerToken));
        handlers.Add(new ResponseVersionHandler());
        var client = factory.CreateDefaultClient(handlers.ToArray());
        return GrpcChannel.ForAddress(client.BaseAddress!, new GrpcChannelOptions { HttpClient = client });
    }

    /// <summary>Adds the credential a real caller would send as gRPC metadata (an HTTP/2 header).</summary>
    private sealed class BearerHandler(string token) : DelegatingHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            return base.SendAsync(request, cancellationToken);
        }
    }

    private sealed class ResponseVersionHandler : DelegatingHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = await base.SendAsync(request, cancellationToken);
            response.Version = request.Version;
            return response;
        }
    }
}
