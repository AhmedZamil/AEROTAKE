using System.Collections.Concurrent;
using Grpc.Core;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Suppliers;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P0-7 / finding F9. Offers are cached by offer id alone (real providers:
/// "sabre:offer:{id}", "hajee:offer:{id}"; the ISupplierProvider lookup methods take
/// no tenant). B2B and the planned B2C tenant share one supplier account, so an
/// offer id issued to one tenant must not be usable by another.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CrossTenantOfferBookingTests(OtaCoreEngineFixture fixture)
{
    /// <summary>Behaves like the real providers: search issues random offer ids and
    /// remembers them keyed by id only; lookups return "unknown" for ids never issued.
    /// (The built-in stub accepts any id, so it cannot show this.)</summary>
    private sealed class OfferIdOnlyCachingSupplier : ISupplierProvider
    {
        private readonly ConcurrentDictionary<string, decimal> _offers = new();
        public string SupplierCode => "SABRE";

        public Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct)
        {
            var id = $"SABRE-{Guid.NewGuid():N}";
            _offers[id] = 200m;
            return Task.FromResult<IReadOnlyList<SupplierOfferResult>>(
                [new SupplierOfferResult(id, "SABRE", 200m, "Test flight", "USD")]);
        }

        public Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) =>
            Task.FromResult<decimal?>(_offers.TryGetValue(offerId, out var n) ? n : null);
        public Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) => Task.FromResult(0m);
        public Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct) =>
            Task.FromResult(_offers.TryGetValue(offerId, out var n)
                ? new RevalidateResult(true, n, null)
                : new RevalidateResult(false, 0, "unknown offer"));
        public Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct) =>
            Task.FromResult(new SupplierBookingResult(true, "PNR-" + Guid.NewGuid().ToString("N")[..6], null, "{}"));
        public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct) =>
            Task.FromResult(new TicketIssueResult(true, null, "{}"));
    }

    /// <summary>One shared supplier (so tenant A's search is visible to tenant B, like the real Redis cache),
    /// and a gRPC client per caller — each with its own token, as in production.</summary>
    private Func<string, OtaCoreService.OtaCoreServiceClient> ClientsWithCachingSupplier()
    {
        var supplier = new OfferIdOnlyCachingSupplier();
        var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
        {
            s.RemoveAll<ISupplierProvider>();
            s.AddSingleton<ISupplierProvider>(supplier);
        }));
        return token => new OtaCoreService.OtaCoreServiceClient(OtaCoreEngineFactory.GrpcChannelFor(factory, token));
    }

    private static TenantContext Ctx(string tenantId, Guid agentId) => new()
    {
        TenantId = tenantId,
        Channel = ChannelType.B2BAgent,
        AgentId = agentId.ToString(),
        AgentTier = AgentTier.Gold,
        Currency = "USD",
    };

    private static B2BBookingRequest Book(string tenantId, Guid agentId, string offerId) => new()
    {
        Tenant = Ctx(tenantId, agentId),
        OfferId = offerId,
        IdempotencyKey = $"key-{Guid.NewGuid()}",
        ContactEmail = "ops@test.example",
        Travelers = { new Traveler { FirstName = "Test", LastName = "Traveler", DocumentType = "PASSPORT", DocumentNumber = "P0000000" } },
    };

    private async Task<string> SearchAsTenantAsync(OtaCoreService.OtaCoreServiceClient client, string tenantId, Guid agentId)
    {
        var search = await client.GetSupplierAvailabilityAsync(new SearchRequest
        {
            Tenant = Ctx(tenantId, agentId),
            ProductType = ProductType.Flight,
            Origin = "DAC",
            Destination = "DXB",
            CheckIn = "2026-12-01",
            Adults = 1,
        });
        return Assert.Single(search.Offers).OfferId;
    }

    [Fact]
    public async Task OwnTenant_CanBookItsOwnSearchedOffer()
    {
        var (tenantA, agentA, tokenA) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = ClientsWithCachingSupplier()(tokenA);
        var offerId = await SearchAsTenantAsync(client, tenantA, agentA);

        var booking = await client.ProcessB2BBookingAsync(Book(tenantA, agentA, offerId));

        Assert.Equal(BookingStatus.Pending, booking.Status);
    }

    [Fact]
    public async Task OtherTenant_CannotBookAnOfferIssuedToTenantA()
    {
        var (tenantA, agentA, tokenA) = await TestData.SeedAgentAsync(fixture.Factory);
        var (tenantB, agentB, tokenB) = await TestData.SeedAgentAsync(fixture.Factory);
        var clientFor = ClientsWithCachingSupplier();
        var offerIssuedToA = await SearchAsTenantAsync(clientFor(tokenA), tenantA, agentA);

        var ex = await Assert.ThrowsAsync<RpcException>(async () =>
            await clientFor(tokenB).ProcessB2BBookingAsync(Book(tenantB, agentB, offerIssuedToA)));

        Assert.Equal(StatusCode.FailedPrecondition, ex.StatusCode);
    }

    [Fact]
    public async Task OtherTenant_CannotRevalidateAnOfferIssuedToTenantA()
    {
        var (tenantA, agentA, tokenA) = await TestData.SeedAgentAsync(fixture.Factory);
        var (tenantB, agentB, tokenB) = await TestData.SeedAgentAsync(fixture.Factory);
        var clientFor = ClientsWithCachingSupplier();
        var offerIssuedToA = await SearchAsTenantAsync(clientFor(tokenA), tenantA, agentA);

        var result = await clientFor(tokenB).RevalidateOfferAsync(new RevalidateRequest
        {
            Tenant = Ctx(tenantB, agentB),
            OfferId = offerIssuedToA,
            ExpectedNetRate = 200,
        });

        Assert.False(result.Matches);
    }
}
