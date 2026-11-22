using Ota.CoreEngine.Domain;
using Xunit;
using Ota.CoreEngine.Pricing;

namespace Ota.CoreEngine.Tests.Unit;

public class PricingCalculatorTests
{
    private readonly PricingCalculator _calculator = new();

    private static MarkupRule Rule(AgentTier tier, decimal markupPercent, decimal subAgentDefaultMargin) => new()
    {
        Tier = tier,
        MarkupPercent = markupPercent,
        SubAgentDefaultMargin = subAgentDefaultMargin,
    };

    [Fact]
    public void Calculate_AppliesFormula_NetTimesOnePlusMarkupPlusMargin()
    {
        // 220 * (1 + 0.06) + 10 = 243.20 — the exact figure from the README's worked example.
        var quote = _calculator.Calculate(220m, AgentTier.Gold, Rule(AgentTier.Gold, 0.06m, 10m), null, "USD");

        Assert.Equal(243.20m, quote.FinalPrice);
        Assert.Equal(220m, quote.SupplierNetRate);
        Assert.Equal(0.06m, quote.AgentMarkupPercent);
        Assert.Equal(10m, quote.SubAgentMargin);
        Assert.Equal("USD", quote.Currency);
    }

    [Fact]
    public void Calculate_SubAgentMarginOverride_TakesPrecedenceOverRuleDefault()
    {
        var quote = _calculator.Calculate(100m, AgentTier.Standard, Rule(AgentTier.Standard, 0.10m, 15m), subAgentMarginOverride: 5m, "USD");

        // 100 * 1.10 + 5 = 115.00, not 125.00 (which the rule's default of 15 would give).
        Assert.Equal(115.00m, quote.FinalPrice);
        Assert.Equal(5m, quote.SubAgentMargin);
    }

    [Theory]
    [InlineData(100.004, 100.00)]   // rounds down
    [InlineData(100.005, 100.01)]   // exact midpoint rounds away from zero, not banker's rounding
    [InlineData(100.006, 100.01)]   // rounds up
    public void Calculate_Rounds_HalfAwayFromZero_To2dp(double net, double expectedFinal)
    {
        var quote = _calculator.Calculate((decimal)net, AgentTier.Standard, Rule(AgentTier.Standard, 0m, 0m), null, "USD");

        Assert.Equal((decimal)expectedFinal, quote.FinalPrice);
    }

    [Fact]
    public void Calculate_NegativeNetRate_Throws()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            _calculator.Calculate(-1m, AgentTier.Standard, Rule(AgentTier.Standard, 0.1m, 0m), null, "USD"));
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    public void Calculate_MarkupPercentOutsideZeroToOne_Throws(double markup)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            _calculator.Calculate(100m, AgentTier.Standard, Rule(AgentTier.Standard, (decimal)markup, 0m), null, "USD"));
    }

    [Fact]
    public void Calculate_RuleTierMismatchesRequestedTier_Throws()
    {
        // Rule built for Gold, but caller asks for Standard pricing — must never
        // silently apply the wrong tier's markup.
        Assert.Throws<InvalidOperationException>(() =>
            _calculator.Calculate(100m, AgentTier.Standard, Rule(AgentTier.Gold, 0.06m, 10m), null, "USD"));
    }

    [Fact]
    public void Calculate_NegativeSubAgentMarginOverride_Throws()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            _calculator.Calculate(100m, AgentTier.Standard, Rule(AgentTier.Standard, 0.1m, 5m), subAgentMarginOverride: -1m, "USD"));
    }
}
