using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Ota.CoreEngine.Tests.Fixtures;

/// <summary>Service clients (frontends) the app under test knows, loaded through SERVICE_CLIENTS. Test secrets only.</summary>
public static class TestServiceClients
{
    public const string BroadId = "test-frontend";          // search + revalidate, B2C and white-label, any tenant
    public const string BroadSecret = "test-broad-secret-1";
    public const string SearchOnlyId = "test-search-only";  // search only, B2C, ONE tenant
    public const string SearchOnlySecret = "test-search-secret-1";
    public const string OnlyTenant = "only-this-tenant";

    private static string Sha(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();

    public static readonly string ConfigJson = JsonSerializer.Serialize(new object[]
    {
        new { id = BroadId, secretSha256 = Sha(BroadSecret), scopes = new[] { "search", "revalidate" }, channels = new[] { "B2C", "WHITE_LABEL" }, tenants = new[] { "*" } },
        new { id = SearchOnlyId, secretSha256 = Sha(SearchOnlySecret), scopes = new[] { "search" }, channels = new[] { "B2C" }, tenants = new[] { OnlyTenant } },
    });
}
