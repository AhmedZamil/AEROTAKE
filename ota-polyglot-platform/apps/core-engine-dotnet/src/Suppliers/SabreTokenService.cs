using System.Text.Json;
using StackExchange.Redis;

namespace Ota.CoreEngine.Suppliers;

public interface ISabreTokenService
{
    Task<string?> GetAccessTokenAsync(CancellationToken ct);
}

/// <summary>
/// OAuth2 v3 JV bearer flow, ported from AeroTake's SabreTokenService.php —
/// verified against the real Sabre cert endpoint before writing this class
/// (grant_type=password with username={epr}-{pcc}-AA, NOT client_credentials;
/// that's the one part of this flow that isn't obvious from Sabre's public
/// docs and cost a failed request to get right).
///
/// Cached in Redis instead of AeroTake's Cache facade — same TTL policy
/// (expires_in - 60s).
/// </summary>
public sealed class SabreTokenService(IHttpClientFactory httpClientFactory, IConnectionMultiplexer redis, IConfiguration config, ILogger<SabreTokenService> logger)
    : ISabreTokenService
{
    private const string CacheKey = "sabre:access_token";

    public async Task<string?> GetAccessTokenAsync(CancellationToken ct)
    {
        var cache = redis.GetDatabase();
        var cached = await cache.StringGetAsync(CacheKey);
        if (cached.HasValue) return cached!;

        var baseUrl = config["SABRE_API_BASE_URL"]?.TrimEnd('/') ?? "https://api.cert.platform.sabre.com";
        var jvClientId = config["SABRE_JV_CLIENT_ID"];
        var jvClientSecret = config["SABRE_JV_CLIENT_SECRET"];
        var epr = config["SABRE_CLIENT_ID"];
        var pcc = config["SABRE_PCC"];
        var password = config["SABRE_PASSWORD"];

        if (string.IsNullOrWhiteSpace(jvClientId) || string.IsNullOrWhiteSpace(jvClientSecret))
        {
            logger.LogWarning("SABRE_JV_CLIENT_ID/SECRET not configured — cannot fetch a Sabre token.");
            return null;
        }

        var client = httpClientFactory.CreateClient("sabre");
        var basicAuth = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{jvClientId}:{jvClientSecret}"));

        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/v3/auth/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["username"] = $"{epr}-{pcc}-AA",
                ["password"] = password ?? "",
            }),
        };
        requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", basicAuth);

        var response = await client.SendAsync(requestMessage, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("Sabre token request failed: {Status} {Body}", response.StatusCode, body);
            return null;
        }

        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("access_token", out var tokenEl) ||
            !doc.RootElement.TryGetProperty("expires_in", out var expiresEl))
        {
            logger.LogError("Sabre token response missing access_token/expires_in: {Body}", body);
            return null;
        }

        var token = tokenEl.GetString()!;
        var expiresIn = expiresEl.GetInt32();
        await cache.StringSetAsync(CacheKey, token, TimeSpan.FromSeconds(Math.Max(60, expiresIn - 60)));

        return token;
    }
}
