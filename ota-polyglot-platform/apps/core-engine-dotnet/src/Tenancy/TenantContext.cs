namespace Ota.CoreEngine.Tenancy;

public sealed class TenantContext
{
    public string TenantId { get; init; } = default!;

    /// <summary>Sales channel of the caller. On authenticated REST requests this
    /// comes only from the token's "channel" claim. Null means "not established"
    /// (anonymous auth endpoints) — there is deliberately no default, since a
    /// silent "B2C" fallback would grant B2C rules to an unidentified caller.</summary>
    public string? Channel { get; init; }

    /// <summary>Kind of principal (agent, customer, guest, service), from the token's
    /// "actor_type" claim. Null only on anonymous requests.</summary>
    public string? ActorType { get; init; }

    /// <summary>The caller's agent, from the token's "agent_id" claim (null for
    /// platform admins and anonymous requests).</summary>
    public Guid? AgentId { get; init; }

    /// <summary>Only populated on the gRPC path, from the request message. REST never
    /// accepts a tier from the caller; pricing resolves it from the Agent record.</summary>
    public string? AgentTier { get; init; }
}

public interface ITenantAccessor
{
    TenantContext? Current { get; }
    void Set(TenantContext context);
}

/// <summary>Scoped holder populated per-request (HTTP header or gRPC metadata).</summary>
public sealed class TenantAccessor : ITenantAccessor
{
    public TenantContext? Current { get; private set; }
    public void Set(TenantContext context) => Current = context;
}

/// <summary>
/// Hydrates the scoped accessor for REST requests. Authenticated requests take
/// tenant, channel and agent from the validated JWT only — X-Channel and
/// X-Agent-Tier headers are ignored, so a caller cannot claim another channel
/// or tier. Only the [AllowAnonymous] auth endpoints read X-Tenant-ID, since
/// there is no token yet. Requests without a tenant are rejected — no
/// cross-tenant "default" exists.
/// </summary>
public sealed class TenantResolutionMiddleware(RequestDelegate next)
{
    public const string TenantHeader = "X-Tenant-ID";
    public const string ChannelClaim = "channel";

    public async Task InvokeAsync(HttpContext http, ITenantAccessor accessor)
    {
        // Health and swagger endpoints are tenant-agnostic.
        var path = http.Request.Path.Value ?? string.Empty;
        // The tenant registry is how a frontend finds the tenant in the first place.
        // SSLCommerz IPN is posted by the gateway with no tenant header — authenticity is the
        // store credentials on the validation API call (see SslCommerzIpnController).
        if (path.StartsWith("/healthz") || path.StartsWith("/swagger") || path.StartsWith("/api/v1/tenant-registry") || path.StartsWith("/.well-known/") || path.StartsWith("/api/v1/auth/service/") || path.StartsWith("/api/v1/payments/sslcommerz/"))
        {
            await next(http);
            return;
        }

        // gRPC calls (port 8081) carry the tenant inside the TenantContext
        // message, not as an HTTP header — OtaCoreGrpcService.RequireTenant
        // populates the accessor from the payload. Enforcing the REST header
        // here would reject every gRPC call before it reaches the service.
        if (http.Request.ContentType?.StartsWith("application/grpc") == true)
        {
            await next(http);
            return;
        }

        // Authenticated requests: trust the validated JWT's claims and nothing
        // else. UseAuthentication() (registered before this middleware in
        // Program.cs) has already verified the token's signature by this
        // point, so this is what actually closes the "any caller can claim
        // any tenant/channel via a header" gap — the header path below remains
        // only for the [AllowAnonymous] auth endpoints themselves, and only
        // for the tenant.
        if (http.User.Identity?.IsAuthenticated == true)
        {
            var tenantIdClaim = http.User.FindFirst("tenant_id")?.Value;
            if (string.IsNullOrWhiteSpace(tenantIdClaim))
            {
                http.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await http.Response.WriteAsJsonAsync(new { error = "invalid_token", message = "Token is missing a tenant_id claim." });
                return;
            }

            // Tokens issued before the channel claim existed lack it; rejecting
            // forces a refresh, which re-issues the token with the claim.
            var channelClaim = http.User.FindFirst(ChannelClaim)?.Value;
            if (string.IsNullOrWhiteSpace(channelClaim))
            {
                http.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await http.Response.WriteAsJsonAsync(new { error = "invalid_token", message = "Token is missing a channel claim." });
                return;
            }

            var actorType = http.User.FindFirst(SharedKernel.ActorTypes.ClaimName)?.Value;
            if (string.IsNullOrWhiteSpace(actorType))
            {
                http.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await http.Response.WriteAsJsonAsync(new { error = "invalid_token", message = "Token is missing an actor_type claim." });
                return;
            }

            accessor.Set(new TenantContext
            {
                TenantId = tenantIdClaim,
                Channel = channelClaim,
                ActorType = actorType,
                AgentId = Guid.TryParse(http.User.FindFirst("agent_id")?.Value, out var agentId) ? agentId : null,
            });

            await next(http);
            return;
        }

        if (!http.Request.Headers.TryGetValue(TenantHeader, out var tenantId) ||
            string.IsNullOrWhiteSpace(tenantId))
        {
            http.Response.StatusCode = StatusCodes.Status400BadRequest;
            await http.Response.WriteAsJsonAsync(new
            {
                error = "missing_tenant",
                message = $"Header '{TenantHeader}' is required."
            });
            return;
        }

        accessor.Set(new TenantContext { TenantId = tenantId.ToString() });

        await next(http);
    }
}
