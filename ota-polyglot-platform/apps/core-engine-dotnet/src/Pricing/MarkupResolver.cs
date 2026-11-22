using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Pricing;

public static class ProductTypes
{
    /// <summary>Search prices with the requested product type ("Flight"); revalidate and booking must look up the
    /// SAME rule, or a tenant that defines a Flight-specific markup would see one price and be charged another.
    /// A "*" wildcard rule still applies when no Flight-specific one exists.</summary>
    public const string Flight = "Flight";
}

/// <summary>Decides which tier and which markup rule price a call. One place, so search, revalidation and
/// booking can never disagree about a price.</summary>
public interface IMarkupResolver
{
    /// <summary>Always the tier the agent is actually stored at — a tier claimed by the caller is not an input. A
    /// caller with no agent, or an unknown one, is priced as Standard.</summary>
    Task<AgentTier> ResolveTierAsync(Caller caller, CancellationToken ct);

    /// <summary>The active rule that prices this caller for a product: consumer callers use the tenant's B2C rules,
    /// everyone else the agent rule for their tier. A specific product rule beats the "*" wildcard.</summary>
    Task<MarkupRule> ResolveRuleAsync(Caller caller, AgentTier tier, string productType, CancellationToken ct);
}

public sealed class MarkupResolver(OtaDbContext db) : IMarkupResolver
{
    public async Task<AgentTier> ResolveTierAsync(Caller caller, CancellationToken ct)
    {
        if (caller.AgentId is { } agentId)
        {
            var stored = await db.Agents.Where(a => a.Id == agentId).Select(a => (AgentTier?)a.Tier).FirstOrDefaultAsync(ct);
            if (stored is not null) return stored.Value;
        }
        return AgentTier.Standard;
    }

    public async Task<MarkupRule> ResolveRuleAsync(Caller caller, AgentTier tier, string productType, CancellationToken ct)
    {
        var channel = MarkupChannels.For(caller.Channel);

        var rules = db.MarkupRules.Where(r => r.IsActive && r.Channel == channel && (r.ProductType == productType || r.ProductType == "*"));
        if (channel == MarkupChannels.B2BAgent) rules = rules.Where(r => r.Tier == tier); // consumer rules have no tier

        return await rules.OrderByDescending(r => r.ProductType != "*") // specific beats wildcard
                   .FirstOrDefaultAsync(ct)
               ?? throw new ServiceException(ErrorKind.FailedPrecondition, channel == MarkupChannels.B2C
                   ? "No active B2C markup rule configured."
                   : $"No active markup rule configured for tier {tier}.");
    }
}
