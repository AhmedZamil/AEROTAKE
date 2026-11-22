using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Pricing;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P4-10: supplier amounts convert to the tenant's SellCurrency; same currency is a no-op; missing rates refuse.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CurrencyConversionTests(OtaCoreEngineFixture fixture)
{
    private async Task<(IServiceScope Scope, ICurrencyConversion Fx)> ScopeAsync()
    {
        using (var seed = fixture.Factory.Services.CreateScope())
            await ExchangeRateSeeder.SeedAsync(seed.ServiceProvider.GetRequiredService<OtaDbContext>(), NullLogger.Instance);
        var scope = fixture.Factory.Services.CreateScope();
        return (scope, scope.ServiceProvider.GetRequiredService<ICurrencyConversion>());
    }

    [Fact]
    public async Task SameCurrency_IsANoOp()
    {
        var (scope, fx) = await ScopeAsync();
        using (scope)
            Assert.Equal(100.50m, await fx.ConvertAsync(100.50m, "bdt", "BDT", default));
    }

    [Fact]
    public async Task UsdToBdt_UsesTheSeededRate()
    {
        var (scope, fx) = await ScopeAsync();
        using (scope)
            Assert.Equal(ExchangeRateSeeder.UsdToBdt, await fx.ConvertAsync(1m, "USD", "BDT", default));
    }

    [Fact]
    public async Task MissingRate_RefusesRatherThanGuessing()
    {
        var (scope, fx) = await ScopeAsync();
        using (scope)
        {
            var ex = await Assert.ThrowsAsync<ServiceException>(() => fx.ConvertAsync(1m, "JPY", "BDT", default));
            Assert.Equal(ErrorKind.FailedPrecondition, ex.Kind);
        }
    }

    [Fact]
    public async Task SellCurrency_ComesFromTheTenantRegistry_NotFromARequestLabel()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory); // SellCurrency = BDT
        var (scope, fx) = await ScopeAsync();
        using (scope)
        {
            Assert.Equal("BDT", await fx.SellCurrencyAsync(tenant, default));
            Assert.Equal("USD", await fx.SellCurrencyAsync($"missing-{Guid.NewGuid():N}", default));
        }
    }

    [Fact]
    public async Task ToSellCurrency_ConvertsNetAndTaxTogether()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var (scope, fx) = await ScopeAsync();
        using (scope)
        {
            var (net, tax, currency) = await fx.ToSellCurrencyAsync(tenant, 200m, 30m, "USD", default);
            Assert.Equal("BDT", currency);
            Assert.Equal(200m * ExchangeRateSeeder.UsdToBdt, net);
            Assert.Equal(30m * ExchangeRateSeeder.UsdToBdt, tax);
        }
    }
}
