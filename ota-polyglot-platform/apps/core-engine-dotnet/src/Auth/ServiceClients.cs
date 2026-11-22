using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Ota.CoreEngine.Auth;

/// <summary>A frontend (BFF) that may obtain service tokens: what it may call (Scopes), for which sales
/// channels, and for which tenants. Everything is an explicit allow-list — there are no defaults, so a
/// misconfigured client can do nothing rather than everything.</summary>
public sealed record ServiceClient(
    string Id,
    string SecretSha256Hex,
    IReadOnlySet<string> Scopes,
    IReadOnlySet<string> Channels,
    IReadOnlySet<string> Tenants)
{
    public const string AnyTenant = "*";
    public const string ScopeSearch = "search";
    public const string ScopeRevalidate = "revalidate";
    private static readonly HashSet<string> KnownScopes = [ScopeSearch, ScopeRevalidate];
    private static readonly HashSet<string> KnownChannels = ["B2C", "B2B_AGENT", "B2B_SUB_AGENT", "WHITE_LABEL"];

    internal static ServiceClient Parse(JsonElement e)
    {
        var id = e.GetProperty("id").GetString();
        if (string.IsNullOrWhiteSpace(id) || id.Any(char.IsWhiteSpace))
            throw new InvalidOperationException("SERVICE_CLIENTS: every client needs an 'id' without spaces.");

        var hash = e.GetProperty("secretSha256").GetString() ?? "";
        if (hash.Length != 64 || !hash.All(Uri.IsHexDigit))
            throw new InvalidOperationException($"SERVICE_CLIENTS: '{id}' secretSha256 must be 64 hex characters (SHA-256 of the secret).");

        HashSet<string> List(string name, Func<string, bool> valid, string what)
        {
            var set = e.GetProperty(name).EnumerateArray().Select(x => x.GetString() ?? "").ToHashSet();
            if (set.Count == 0) throw new InvalidOperationException($"SERVICE_CLIENTS: '{id}' must list at least one {what}.");
            var bad = set.FirstOrDefault(x => !valid(x));
            if (bad is not null) throw new InvalidOperationException($"SERVICE_CLIENTS: '{id}' has an invalid {what}: '{bad}'.");
            return set;
        }

        return new ServiceClient(id, hash.ToLowerInvariant(),
            List("scopes", KnownScopes.Contains, "scope"),
            List("channels", KnownChannels.Contains, "channel"),
            List("tenants", t => t == AnyTenant || (t.Length > 0 && !t.Any(char.IsWhiteSpace)), "tenant (or \"*\")"));
    }
}

public interface IServiceClientRegistry
{
    /// <summary>The client if id and secret match, otherwise null (indistinguishable to the caller).</summary>
    ServiceClient? Authenticate(string? clientId, string? secret);
    bool Any { get; }
}

/// <summary>Clients come from configuration (SERVICE_CLIENTS: a JSON array). Only a SHA-256 of each secret is
/// stored, so the configuration alone can't be replayed as a credential. The secrets are long random values
/// (scripts/generate-service-clients.sh), so a fast hash is appropriate — unlike a human password.</summary>
public sealed class ServiceClientRegistry : IServiceClientRegistry
{
    private readonly Dictionary<string, ServiceClient> _clients;

    private ServiceClientRegistry(IEnumerable<ServiceClient> clients) =>
        _clients = clients.ToDictionary(c => c.Id, StringComparer.Ordinal);

    public static ServiceClientRegistry Empty { get; } = new([]);

    public static ServiceClientRegistry FromJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var clients = doc.RootElement.EnumerateArray().Select(ServiceClient.Parse).ToList();
        var dup = clients.GroupBy(c => c.Id).FirstOrDefault(g => g.Count() > 1);
        if (dup is not null) throw new InvalidOperationException($"SERVICE_CLIENTS: duplicate client id '{dup.Key}'.");
        return new ServiceClientRegistry(clients);
    }

    public bool Any => _clients.Count > 0;

    public ServiceClient? Authenticate(string? clientId, string? secret)
    {
        // Hash and compare even for an unknown client so response time doesn't reveal which ids exist.
        var supplied = SHA256.HashData(Encoding.UTF8.GetBytes(secret ?? ""));
        var known = clientId is not null && _clients.TryGetValue(clientId, out var c) ? c : null;
        var expected = known is null ? new byte[32] : Convert.FromHexString(known.SecretSha256Hex);
        var match = CryptographicOperations.FixedTimeEquals(supplied, expected);
        return match && known is not null ? known : null;
    }
}
