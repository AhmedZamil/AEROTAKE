using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Pricing;
using Ota.CoreEngine.Tenancy;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

[Collection(OtaCoreEngineCollection.Name)]
public class ExchangeRatesControllerTests(OtaCoreEngineFixture fixture)
{
    private static object CreateBody(string from, string to, decimal rate, DateTimeOffset? effectiveFrom = null) =>
        new { fromCurrency = from, toCurrency = to, rate, effectiveFrom };

    private async Task<(HttpClient Admin, string TenantId)> AdminClientAsync()
    {
        var (tenantId, _, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var token = await TestData.SeedAdminUserAsync(fixture.Factory, tenantId);
        return (fixture.Factory.CreateAuthenticatedClient(token), tenantId);
    }

    [Fact]
    public async Task Create_AsAdmin_Returns201_AndNormalizesCurrencies()
    {
        var (client, _) = await AdminClientAsync();
        var pair = UniquePair();

        var response = await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody(pair.From.ToLowerInvariant(), pair.To.ToLowerInvariant(), 99.5m));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(pair.From, body.GetProperty("fromCurrency").GetString());
        Assert.Equal(pair.To, body.GetProperty("toCurrency").GetString());
        Assert.Equal(99.5m, body.GetProperty("rate").GetDecimal());
        Assert.Equal("manual", body.GetProperty("source").GetString());
    }

    [Fact]
    public async Task Create_AsAgencyAdmin_Returns403()
    {
        var (tenantId, _, agencyToken) = await TestData.SeedAgentAsync(fixture.Factory);
        _ = tenantId;
        var client = fixture.Factory.CreateAuthenticatedClient(agencyToken);

        var response = await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody("USD", "JPY", 150m));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_RateNotPositive_Returns400()
    {
        var (client, _) = await AdminClientAsync();

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody("USD", "CAD", 0m))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody("USD", "CAD", -1m))).StatusCode);
    }

    [Fact]
    public async Task Create_SameCurrency_Returns400()
    {
        var (client, _) = await AdminClientAsync();

        var response = await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody("USD", "usd", 1m));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_ClosesPreviousOpenRateForSamePair()
    {
        var (client, _) = await AdminClientAsync();
        var pair = UniquePair();
        var firstFrom = DateTimeOffset.UtcNow.AddDays(-2);

        var first = await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody(pair.From, pair.To, 10m, firstFrom));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var firstId = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var secondFrom = DateTimeOffset.UtcNow.AddMinutes(-1);
        var second = await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody(pair.From, pair.To, 11m, secondFrom));
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);

        var closed = await client.GetAsync($"/api/v1/exchange-rates/{firstId}");
        Assert.Equal(HttpStatusCode.OK, closed.StatusCode);
        var closedBody = await closed.Content.ReadFromJsonAsync<JsonElement>();
        var effectiveTo = closedBody.GetProperty("effectiveTo").GetDateTimeOffset();
        // Postgres timestamptz keeps microseconds; a DateTimeOffset can be 100ns finer than that.
        Assert.True((effectiveTo - secondFrom).Duration() < TimeSpan.FromTicks(10));

        var list = await client.GetAsync($"/api/v1/exchange-rates?from={pair.From}&to={pair.To}");
        var items = (await list.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items");
        Assert.Equal(1, items.GetArrayLength());
        Assert.Equal(11m, items[0].GetProperty("rate").GetDecimal());
    }

    [Fact]
    public async Task Update_ChangesRate()
    {
        var (client, _) = await AdminClientAsync();
        var pair = UniquePair();
        var create = await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody(pair.From, pair.To, 1.2m));
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var update = await client.PutAsJsonAsync($"/api/v1/exchange-rates/{id}", new { rate = 1.25m });

        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(1.25m, (await update.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rate").GetDecimal());
    }

    [Fact]
    public async Task SoftClose_Returns204_AndHidesFromActiveList()
    {
        var (client, _) = await AdminClientAsync();
        var pair = UniquePair();
        var create = await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody(pair.From, pair.To, 2m));
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var delete = await client.DeleteAsync($"/api/v1/exchange-rates/{id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        var list = await client.GetAsync($"/api/v1/exchange-rates?from={pair.From}&to={pair.To}");
        Assert.Equal(0, (await list.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task CreatedRate_IsUsedByCurrencyConversion()
    {
        var (client, tenantId) = await AdminClientAsync();
        var pair = UniquePair();
        var create = await client.PostAsJsonAsync("/api/v1/exchange-rates", CreateBody(pair.From, pair.To, 7.5m));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        using var scope = fixture.Factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<ITenantAccessor>().Set(new TenantContext { TenantId = tenantId });
        var fx = scope.ServiceProvider.GetRequiredService<ICurrencyConversion>();

        Assert.Equal(75m, await fx.ConvertAsync(10m, pair.From, pair.To, default));
    }

    /// <summary>Avoid colliding with seeded USD/BDT (etc.) or parallel tests.
    /// Codes must be 3 letters A–Z only (controller rejects digits).</summary>
    private static (string From, string To) UniquePair()
    {
        var n = Guid.NewGuid().ToByteArray();
        static char Letter(byte b) => (char)('A' + (b % 26));
        var from = $"{Letter(n[0])}{Letter(n[1])}{Letter(n[2])}";
        var to = $"{Letter(n[3])}{Letter(n[4])}{Letter(n[5])}";
        if (from == to) to = to[0] == 'Z' ? "AAA" : $"{(char)(to[0] + 1)}{to[1]}{to[2]}";
        return (from, to);
    }
}