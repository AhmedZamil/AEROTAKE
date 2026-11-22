namespace Ota.CoreEngine.Auth;

/// <summary>Who a token is FOR. A token is only accepted where its audience matches, so a
/// token minted for one kind of caller can't be replayed as another even though they share
/// an issuer. The API pipeline currently accepts only <see cref="Agents"/>; customer and
/// internal (service) audiences get their own validation when those callers exist
/// (P3-1 and P0-11/P0-12), rather than being accepted everywhere now.</summary>
public static class TokenAudiences
{
    /// <summary>Agency staff and platform admins — the Users table.</summary>
    public const string Agents = "ota-agents";

    /// <summary>B2C customers and guests.</summary>
    public const string Customers = "ota-customers";

    /// <summary>Service-to-service calls (a frontend's BFF calling core over gRPC).</summary>
    public const string Internal = "ota-internal";
}
