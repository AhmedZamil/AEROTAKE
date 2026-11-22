using System.Text;
using System.Text.Json;
using StackExchange.Redis;

namespace Ota.CoreEngine.Suppliers;

public interface IHajeeTokenService
{
    Task<string?> GetAccessTokenAsync(CancellationToken ct);

    /// <summary>Drops the cached token so the next call fetches a fresh one —
    /// used when Hajee answers 401 to a token we still thought was valid.</summary>
    Task InvalidateAsync();
}

/// <summary>
/// Hajee Air partner API auth: POST /oauth/v1/token with the account's
/// X-API-ACCESS-KEY header and {grant_type: client_credentials, clientId}.
/// Verified against staging (201, 10 h token). Cached in Redis for
/// expires_in - 5 min, same idea as SabreTokenService.
/// </summary>
public sealed class HajeeTokenService(
    IHttpClientFactory httpClientFactory,
    IConnectionMultiplexer redis,
    IConfiguration config,
    ILogger<HajeeTokenService> logger) : IHajeeTokenService
{
    private const string CacheKey = "hajee:access_token";

    public async Task<string?> GetAccessTokenAsync(CancellationToken ct)
    {
        var cache = redis.GetDatabase();
        var cached = await cache.StringGetAsync(CacheKey);
        if (cached.HasValue) return cached!;

        var baseUrl = HajeeConfig.BaseUrl(config);
        var accessKey = config["HAJEE_API_ACCESS_KEY"];
        var clientId = config["HAJEE_CLIENT_ID"];
        if (baseUrl is null || string.IsNullOrWhiteSpace(accessKey) || string.IsNullOrWhiteSpace(clientId))
        {
            logger.LogWarning("Hajee credentials/base URL not (validly) configured — cannot fetch a token.");
            return null;
        }

        var client = httpClientFactory.CreateClient("hajee");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/oauth/v1/token")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { grant_type = "client_credentials", clientId }),
                Encoding.UTF8, "application/json"),
        };
        request.Headers.Accept.ParseAdd("application/json");
        request.Headers.Add("X-API-ACCESS-KEY", accessKey);

        var response = await client.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            // Body only — never log the request (it carries the access key).
            logger.LogError("Hajee token request failed: {Status} {Body}", (int)response.StatusCode, body);
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var payload = doc.RootElement.GetProperty("payload");
            var token = payload.GetProperty("access_token").GetString();
            var expiresIn = payload.TryGetProperty("expires_in", out var e) ? e.GetInt32() : 3600;
            if (string.IsNullOrWhiteSpace(token)) return null;
            await cache.StringSetAsync(CacheKey, token, TimeSpan.FromSeconds(Math.Max(60, expiresIn - 300)));
            return token;
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            logger.LogError(ex, "Hajee token response was not in the expected shape.");
            return null;
        }
    }

    public Task InvalidateAsync() => redis.GetDatabase().KeyDeleteAsync(CacheKey);
}

public static class HajeeConfig
{
    /// <summary>Base URL, only if it is HTTPS. Passenger passport data flows
    /// through this API, so a plain-http (or raw-IP http) endpoint is refused
    /// rather than silently used — the vendor PDF's reprice/hold examples
    /// show http://82.112.238.135:121, which we deliberately don't follow.</summary>
    public static string? BaseUrl(IConfiguration config)
    {
        var url = config["HAJEE_API_BASE_URL"]?.Trim().TrimEnd('/');
        return !string.IsNullOrEmpty(url) && url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? url : null;
    }

    public static bool IsConfigured(IConfiguration config) =>
        BaseUrl(config) is not null
        && !string.IsNullOrWhiteSpace(config["HAJEE_API_ACCESS_KEY"])
        && !string.IsNullOrWhiteSpace(config["HAJEE_CLIENT_ID"]);
}
