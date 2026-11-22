using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Pricing;

public sealed record PriceQuote(
    decimal SupplierNetRate,
    decimal AgentMarkupPercent,
    decimal SubAgentMargin,
    decimal TaxAmount,
    decimal FinalPrice,
    string Currency);

public interface IPricingCalculator
{
    /// <summary>
    /// Final Price = (Supplier Net Rate × (1 + Agent Markup) + SubAgent Margin) + Tax.
    /// Tax is added after markup, not marked up itself — it's a pass-through
    /// government/airport charge, not supplier margin the agency profits on
    /// (and some airline/GDS agreements explicitly disallow marking it up).
    /// </summary>
    PriceQuote Calculate(
        decimal supplierNetRate,
        AgentTier tier,
        MarkupRule rule,
        decimal? subAgentMarginOverride,
        string currency,
        decimal taxAmount = 0m);
}

/// <summary>
/// Pure, stateless domain service. All monetary math is decimal and rounded
/// half-up to 2dp at the very end so intermediate precision is preserved.
/// </summary>
public sealed class PricingCalculator : IPricingCalculator
{
    public PriceQuote Calculate(
        decimal supplierNetRate,
        AgentTier tier,
        MarkupRule rule,
        decimal? subAgentMarginOverride,
        string currency,
        decimal taxAmount = 0m)
    {
        if (supplierNetRate < 0)
            throw new ArgumentOutOfRangeException(nameof(supplierNetRate), "Net rate cannot be negative.");
        if (taxAmount < 0)
            throw new ArgumentOutOfRangeException(nameof(taxAmount), "Tax amount cannot be negative.");
        if (rule.MarkupPercent is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(rule), "Markup percent must be within [0, 1].");
        // An agent rule must be the agent's own tier; a consumer rule has no tier to match.
        if (rule.Tier is { } ruleTier && ruleTier != tier)
            throw new InvalidOperationException($"Markup rule tier {ruleTier} does not match agent tier {tier}.");

        var subAgentMargin = subAgentMarginOverride ?? rule.SubAgentDefaultMargin;
        if (subAgentMargin < 0)
            throw new ArgumentOutOfRangeException(nameof(subAgentMarginOverride), "Sub-agent margin cannot be negative.");

        var final = supplierNetRate * (1 + rule.MarkupPercent) + subAgentMargin + taxAmount;
        final = Math.Round(final, 2, MidpointRounding.AwayFromZero);

        return new PriceQuote(
            SupplierNetRate: supplierNetRate,
            AgentMarkupPercent: rule.MarkupPercent,
            SubAgentMargin: subAgentMargin,
            TaxAmount: taxAmount,
            FinalPrice: final,
            Currency: currency);
    }
}
