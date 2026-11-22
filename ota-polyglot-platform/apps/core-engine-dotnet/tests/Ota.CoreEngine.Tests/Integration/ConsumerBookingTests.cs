using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Suppliers;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using ChannelType = Ota.CoreEngine.Grpc.ChannelType;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P4-1 / P4-8 / P5-17: booking as a signed-in consumer. Reserves seats, records a Pending booking owned by the customer.
/// Guest create (POST /api/v1/guest/bookings) is refused. Reserves seats, records a Pending booking owned by the right
/// person with the itinerary they were shown, prices it server-side, and never shows a consumer anything about our cost or supplier.
/// (Payment is a later step; nothing here charges anyone.)</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class ConsumerBookingTests(OtaCoreEngineFixture fixture)
{
    private const string PassportNumber = "P7777777";

    /// <summary>Like the real providers: search issues random offer ids, remembered by id only. Counts holds so tests can prove nothing was held.</summary>
    private sealed class FakeSupplier : ISupplierProvider
    {
        private readonly ConcurrentDictionary<string, decimal> _offers = new();
        public int Holds;
        public int FailOnHold;
        public B2BBookingRequest? LastHold;
        public readonly List<string> CreatedPnrs = [];
        public readonly List<string> Cancels = [];
        public Dictionary<string, string> LastSearchFilters = [];
        public bool RefuseHolds;
        public string SupplierCode => "SABRE";

        public Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct)
        {
            LastSearchFilters = request.Filters.ToDictionary(f => f.Key, f => f.Value);
            var id = $"SABRE-{Guid.NewGuid():N}";
            _offers[id] = 200m;
            var dep = new DateTimeOffset(2026, 12, 1, 3, 0, 0, TimeSpan.Zero);
            var segments = new List<FlightSegmentResult>
            {
                new("EK", "585", "DAC", "DXB", dep, dep.AddHours(5), "Y", 0, "2026-12-01T09:00:00", "2026-12-01T12:00:00"),
            };
            if (!string.IsNullOrWhiteSpace(request.CheckOut))
            {
                var back = new DateTimeOffset(2026, 12, 8, 8, 0, 0, TimeSpan.Zero);
                segments.Add(new("EK", "586", "DXB", "DAC", back, back.AddHours(5), "Y", 1, "2026-12-08T12:00:00", "2026-12-08T19:00:00"));
            }
            return Task.FromResult<IReadOnlyList<SupplierOfferResult>>([new SupplierOfferResult(
                id, "SABRE", 200m, "DAC to DXB", "USD", segments,
                CheckedBaggageIncluded: true, CheckedBaggageWeightKg: 30, TaxAmount: 30m)]);
        }
        public Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) => Task.FromResult<decimal?>(_offers.TryGetValue(offerId, out var n) ? n : null);
        public Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) => Task.FromResult(30m);
        public Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct) =>
            Task.FromResult(_offers.TryGetValue(offerId, out var n) ? new RevalidateResult(n == expectedNetRate, n, null, 30m) : new RevalidateResult(false, 0, "unknown offer"));
        public Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct)
        {
            var n = Interlocked.Increment(ref Holds);
            LastHold = request;
            if (RefuseHolds || (FailOnHold > 0 && n == FailOnHold))
                return Task.FromResult(new SupplierBookingResult(false, null, "no seats", "{}"));
            var pnr = "SUPPLIER-PNR-" + Guid.NewGuid().ToString("N")[..6];
            CreatedPnrs.Add(pnr);
            return Task.FromResult(new SupplierBookingResult(true, pnr, null, "{}"));
        }
        public Task CancelHoldAsync(string supplierCode, string supplierPnrId, CancellationToken ct)
        {
            Cancels.Add(supplierPnrId);
            return Task.CompletedTask;
        }
        public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct) => Task.FromResult(new TicketIssueResult(true, null, "{}"));
    }

    private readonly FakeSupplier _supplier = new();
    private readonly FakeEmailSender _mail = new();
    private readonly TestIdp _idp = new();
    private WebApplicationFactory<Program>? _factory;

    private WebApplicationFactory<Program> Factory => _factory ??= fixture.Factory.WithWebHostBuilder(b =>
    {
        b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["STOREFRONT_PUBLIC_URL"] = "http://localhost:3001",
        }));
        b.ConfigureServices(s =>
        {
            s.RemoveAll<ISupplierProvider>(); s.AddSingleton<ISupplierProvider>(_supplier);
            s.RemoveAll<IEmailSender>(); s.AddSingleton<IEmailSender>(_mail);
            s.RemoveAll<IExternalIdentityVerifier>(); s.AddSingleton(_idp.Verifier());
        });
    });

    /// <summary>A live B2C storefront with a consumer markup rule (6% + 10, like the seeded one).</summary>
    private async Task<string> StorefrontAsync()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        db.MarkupRules.Add(new MarkupRule { TenantId = tenant, Channel = MarkupChannels.B2C, Tier = null, MarkupPercent = 0.06m, SubAgentDefaultMargin = 10m });
        await db.SaveChangesAsync();
        return tenant;
    }

    private async Task<string> ServiceTokenAsync()
    {
        var r = await fixture.Factory.CreateClient().PostAsJsonAsync("/api/v1/auth/service/token", new { clientId = TestServiceClients.BroadId, clientSecret = TestServiceClients.BroadSecret });
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
    }

    /// <summary>What the storefront's server does: search as the B2C service for a tenant. Returns the offer as the public sees it.</summary>
    private async Task<SupplierOffer> SearchAsync(string tenant, string? pretendRequestCurrency = null, string? checkOut = null, string? checkIn = null)
    {
        var client = new OtaCoreService.OtaCoreServiceClient(OtaCoreEngineFactory.GrpcChannelFor(Factory, await ServiceTokenAsync()));
        var response = await client.GetSupplierAvailabilityAsync(new SearchRequest
        {
            Tenant = new TenantContext { TenantId = tenant, Channel = ChannelType.B2C, Currency = pretendRequestCurrency ?? "" },
            ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = checkIn ?? "2026-12-01", CheckOut = checkOut ?? "", Adults = 1,
        });
        return Assert.Single(response.Offers);
    }

    private HttpClient Client(string? tenant, string? bearer = null)
    {
        var c = Factory.CreateClient();
        if (tenant is not null) c.DefaultRequestHeaders.Add("X-Tenant-ID", tenant);
        if (bearer is not null) c.DefaultRequestHeaders.Authorization = new("Bearer", bearer);
        return c;
    }

    private static object Body(string offerId, string? key = null, string email = "Guest@Example.test", decimal? expected = null, object[]? travelers = null) => new
    {
        offerId, idempotencyKey = key ?? Guid.NewGuid().ToString(), contactEmail = email, contactPhone = "+8801700000000", expectedTotal = expected,
        travelers = travelers ?? [new { firstName = "Sam", lastName = "Rahman", dateOfBirth = "1990-01-01", documentType = "passport", documentNumber = PassportNumber, nationality = "bd", passportExpiryDate = "2032-01-31" }],
    };

    private const string GuestUrl = "/api/v1/guest/bookings";
    private const string MyUrl = "/api/v1/customers/me/bookings";

    private async Task<string> SignInAsync(string tenant, string sub, string email)
    {
        var r = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", new { provider = "google", idToken = _idp.IdToken(sub, email, emailVerified: true) });
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
    }

    /// <summary>P5-17: every reserve goes through the customer endpoint with a bearer token.</summary>
    private async Task<(HttpResponseMessage Response, string Token)> ReserveAsCustomerAsync(
        string tenant, object body, string? sub = null, string? email = null)
    {
        email ??= "guest@example.test";
        sub ??= $"sub-{Guid.NewGuid():N}"[..20];
        var token = await SignInAsync(tenant, sub, email);
        return (await Client(tenant, token).PostAsJsonAsync(MyUrl, body), token);
    }

    private async Task<T> DbAsync<T>(string tenant, Func<OtaDbContext, Task<T>> q)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        return await q(scope.ServiceProvider.GetRequiredService<OtaDbContext>());
    }

    private static decimal Total(JsonElement booking) => booking.GetProperty("total").GetDecimal();

    // ------------------------------------------------------------------------------------------ login required (P5-17)

    [Fact]
    public async Task GuestCreate_IsRefused_LoginRequired()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);

        var response = await Client(tenant).PostAsJsonAsync(GuestUrl, Body(offer.OfferId, expected: (decimal)offer.SellPrice));
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("login_required", body.GetProperty("error").GetString());
        Assert.Equal(0, _supplier.Holds);
        Assert.Equal(0, await DbAsync(tenant, db => db.Bookings.CountAsync()));
        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task ACustomerBooking_IsReserved_PricedByTheServer_AndOwnedByTheirAccount()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);

        var (response, _) = await ReserveAsCustomerAsync(tenant, Body(offer.OfferId, expected: (decimal)offer.SellPrice), email: "guest@example.test");
        var raw = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var booking = JsonDocument.Parse(raw).RootElement.GetProperty("booking");
        Assert.Equal("Pending", booking.GetProperty("status").GetString());
        Assert.Equal((decimal)offer.SellPrice, Total(booking));
        Assert.Equal("BDT", booking.GetProperty("currency").GetString());
        Assert.NotNull(booking.GetProperty("ticketingDeadline").GetDateTimeOffset() as object);

        var row = await DbAsync(tenant, db => db.Bookings.SingleAsync(b => b.Pnr == booking.GetProperty("reference").GetString()));
        Assert.Equal((BookingChannels.B2C, null, Domain.BookingStatus.Pending), (row.Channel, row.AgentId, row.Status));
        Assert.NotNull(row.CustomerId);
        Assert.Null(row.GuestEmail);
        Assert.Equal(1, _supplier.Holds);
        Assert.True(row.TicketingDeadline > DateTimeOffset.UtcNow && row.TicketingDeadline < DateTimeOffset.UtcNow.AddHours(1));
        var holdMail = Assert.Single(_mail.Sent);
        Assert.Equal("guest@example.test", holdMail.To);
        Assert.Contains("held", holdMail.Subject, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(row.Pnr, holdMail.Body);
        Assert.Contains("http://localhost:3001/my-bookings", holdMail.Body);
    }

    [Fact]
    public async Task ARoundTripOffer_IsOneBooking_CoveringBothDirections()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant, checkOut: "2026-12-08");
        Assert.Equal(2, offer.Segments.Count);

        var (response, token) = await ReserveAsCustomerAsync(tenant, Body(offer.OfferId, expected: (decimal)offer.SellPrice), email: "rt@example.test");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, _supplier.Holds);

        var list = await (await Client(tenant, token).GetAsync(MyUrl)).Content.ReadFromJsonAsync<JsonElement>();
        var itinerary = list[0].GetProperty("itinerary");
        Assert.Equal(2, itinerary.GetArrayLength());
        Assert.Equal(("DAC", "DXB", 0), (itinerary[0].GetProperty("origin").GetString(), itinerary[0].GetProperty("destination").GetString(), itinerary[0].GetProperty("legIndex").GetInt32()));
        Assert.Equal(("DXB", "DAC", 1), (itinerary[1].GetProperty("origin").GetString(), itinerary[1].GetProperty("destination").GetString(), itinerary[1].GetProperty("legIndex").GetInt32()));
        Assert.Equal((decimal)offer.SellPrice, list[0].GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task MultiCity_IsOneBooking_OnePrice_AndBothHolds()
    {
        var tenant = await StorefrontAsync();
        var first = await SearchAsync(tenant);
        var second = await SearchAsync(tenant, checkIn: "2026-12-15");
        var total = (decimal)first.SellPrice + (decimal)second.SellPrice;

        var (response, token) = await ReserveAsCustomerAsync(tenant, new
        {
            offerId = first.OfferId,
            offerIds = new[] { first.OfferId, second.OfferId },
            idempotencyKey = Guid.NewGuid().ToString(),
            contactEmail = "multi@example.test",
            contactPhone = "+8801700000000",
            expectedTotal = total,
            travelers = new[] { new { firstName = "Sam", lastName = "Rahman", dateOfBirth = "1990-01-01", documentType = "passport", documentNumber = PassportNumber, nationality = "bd", passportExpiryDate = "2032-01-31" } },
        }, email: "multi@example.test");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(2, _supplier.Holds);
        Assert.Empty(_supplier.Cancels);

        var list = await (await Client(tenant, token).GetAsync(MyUrl)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(total, list[0].GetProperty("total").GetDecimal());
        var itinerary = list[0].GetProperty("itinerary");
        Assert.Equal(2, itinerary.GetArrayLength());
        Assert.Equal(0, itinerary[0].GetProperty("legIndex").GetInt32());
        Assert.Equal(1, itinerary[1].GetProperty("legIndex").GetInt32());

        var row = await DbAsync(tenant, db => db.Bookings.SingleAsync());
        Assert.Contains(first.OfferId, row.LegsJson);
        Assert.Contains(second.OfferId, row.LegsJson);
        Assert.Contains(_supplier.CreatedPnrs[0], row.LegsJson);
        Assert.Contains(_supplier.CreatedPnrs[1], row.LegsJson);
    }

    [Fact]
    public async Task MultiCity_WhenALaterLegCannotBeHeld_ReleasesTheEarlierHold_AndSavesNothing()
    {
        _supplier.FailOnHold = 2;
        var tenant = await StorefrontAsync();
        var first = await SearchAsync(tenant);
        var second = await SearchAsync(tenant, checkIn: "2026-12-16");

        var (response, _) = await ReserveAsCustomerAsync(tenant, new
        {
            offerId = first.OfferId,
            offerIds = new[] { first.OfferId, second.OfferId },
            idempotencyKey = Guid.NewGuid().ToString(),
            contactEmail = "partial@example.test",
            contactPhone = "+8801700000000",
            expectedTotal = (decimal)first.SellPrice + (decimal)second.SellPrice,
            travelers = new[] { new { firstName = "Sam", lastName = "Rahman", dateOfBirth = "1990-01-01", documentType = "passport", documentNumber = PassportNumber, nationality = "bd", passportExpiryDate = "2032-01-31" } },
        }, email: "partial@example.test");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(2, _supplier.Holds);
        Assert.Equal(_supplier.CreatedPnrs, _supplier.Cancels);
        Assert.Equal(0, await DbAsync(tenant, db => db.Bookings.CountAsync()));
    }

    [Fact]
    public async Task MultiCity_WhenTheShownTotalIsStale_HoldsNothing()
    {
        var tenant = await StorefrontAsync();
        var first = await SearchAsync(tenant);
        var second = await SearchAsync(tenant, checkIn: "2026-12-17");

        var (response, _) = await ReserveAsCustomerAsync(tenant, new
        {
            offerId = first.OfferId,
            offerIds = new[] { first.OfferId, second.OfferId },
            idempotencyKey = Guid.NewGuid().ToString(),
            contactEmail = "stale@example.test",
            contactPhone = "+8801700000000",
            expectedTotal = 1m,
            travelers = new[] { new { firstName = "Sam", lastName = "Rahman", dateOfBirth = "1990-01-01", documentType = "passport", documentNumber = PassportNumber, nationality = "bd", passportExpiryDate = "2032-01-31" } },
        }, email: "stale@example.test");

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("price_changed", body.GetProperty("error").GetString());
        Assert.Equal((decimal)first.SellPrice + (decimal)second.SellPrice, body.GetProperty("newTotal").GetDecimal());
        Assert.Equal(0, _supplier.Holds);
    }

    [Fact]
    public async Task TheBooking_KeepsTheItineraryTheCustomerWasShown_AndItReachesMyBookings()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        var (created, token) = await ReserveAsCustomerAsync(tenant, Body(offer.OfferId), email: "itin@example.test");
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var list = await (await Client(tenant, token).GetAsync(MyUrl)).Content.ReadFromJsonAsync<JsonElement>();
        var segment = list[0].GetProperty("itinerary")[0];
        Assert.Equal(("EK", "585", "DAC", "DXB"), (segment.GetProperty("airlineCode").GetString(), segment.GetProperty("flightNumber").GetString(), segment.GetProperty("origin").GetString(), segment.GetProperty("destination").GetString()));
        Assert.False(list[0].TryGetProperty("title", out _));
        Assert.True(list[0].GetProperty("checkedBaggageIncluded").GetBoolean());
    }

    // ------------------------------------------------------------------------------------------ nothing about cost or supplier leaves

    [Fact]
    public async Task AConsumerNeverSeesNetRateMarginSupplierOrDocumentNumbers()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        // what the search itself gave the public
        Assert.Equal((0d, ""), (offer.NetRate, offer.SupplierCode));
        Assert.True(offer.SellPrice > 0);

        var (reservedRes, token) = await ReserveAsCustomerAsync(tenant, Body(offer.OfferId), sub: "leak-1", email: "leak1@example.test");
        var reserved = await reservedRes.Content.ReadAsStringAsync();
        var offer2 = await SearchAsync(tenant);
        var mine = await (await Client(tenant, token).PostAsJsonAsync(MyUrl, Body(offer2.OfferId))).Content.ReadAsStringAsync();
        var list = await (await Client(tenant, token).GetAsync(MyUrl)).Content.ReadAsStringAsync();

        foreach (var text in new[] { reserved, mine, list })
            foreach (var forbidden in new[] { "netRate", "NetRate", "supplier", "Supplier", "SUPPLIER-PNR", "SABRE", "markup", "Markup", "margin", "Margin", PassportNumber, "PASSPORT", "passport", "idempotency" })
                Assert.DoesNotContain(forbidden, text);
    }

    [Fact]
    public async Task AnAgentsSearch_StillSeesTheNetRate()
    {
        // the blanking is for consumers only: an agent needs to see cost
        var (tenant, agentId, agentToken) = await TestData.SeedAgentAsync(fixture.Factory);
        var client = new OtaCoreService.OtaCoreServiceClient(OtaCoreEngineFactory.GrpcChannelFor(Factory, agentToken));

        var response = await client.GetSupplierAvailabilityAsync(new SearchRequest
        {
            Tenant = new TenantContext { TenantId = tenant, AgentId = agentId.ToString() },
            ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = "2026-12-01", Adults = 1,
        });

        var offer = Assert.Single(response.Offers);
        Assert.Equal((200d, "SABRE"), (offer.NetRate, offer.SupplierCode));
    }

    // ------------------------------------------------------------------------------------------ price is the server's

    [Fact]
    public async Task IfThePriceNoLongerMatchesWhatWasShown_NothingIsReserved_AndTheNewPriceIsReturned()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);

        var (response, _) = await ReserveAsCustomerAsync(tenant, Body(offer.OfferId, expected: 1m));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(("price_changed", (decimal)offer.SellPrice, "BDT"), (body.GetProperty("error").GetString(), body.GetProperty("newTotal").GetDecimal(), body.GetProperty("currency").GetString()));
        Assert.Equal(0, _supplier.Holds);
        Assert.Equal(0, await DbAsync(tenant, db => db.Bookings.CountAsync()));
    }

    [Fact]
    public async Task ThePriceInTheRequestBody_IsNotAnInput()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        var body = new Dictionary<string, object?>
        {
            ["offerId"] = offer.OfferId, ["idempotencyKey"] = Guid.NewGuid().ToString(), ["contactEmail"] = "p@example.test",
            ["finalPrice"] = 1, ["total"] = 1, ["currency"] = "EUR", ["netRate"] = 1, ["agentId"] = Guid.NewGuid(), ["channel"] = "B2B_AGENT",
            ["travelers"] = new[] { new { firstName = "A", lastName = "B", documentType = "passport", documentNumber = "P1234567", passportExpiryDate = "2032-01-31" } },
        };

        var (priced, _) = await ReserveAsCustomerAsync(tenant, body);
        var booking = (await priced.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("booking");

        Assert.Equal(((decimal)offer.SellPrice, "BDT"), (Total(booking), booking.GetProperty("currency").GetString()));
        var row = await DbAsync(tenant, db => db.Bookings.SingleAsync());
        Assert.Equal((BookingChannels.B2C, null), (row.Channel, row.AgentId));
    }

    [Fact]
    public async Task ARequestCurrencyLabel_DoesNotChangeTheQuotedCurrency_SellCurrencyComesFromTheTenant()
    {
        // P4-10 / F11: frontends used to hardcode Tenant.Currency = "USD"; core must ignore it and use Tenant.SellCurrency (BDT).
        var tenant = await StorefrontAsync();
        var asUsd = await SearchAsync(tenant, pretendRequestCurrency: "USD");
        var asEur = await SearchAsync(tenant, pretendRequestCurrency: "EUR");

        Assert.Equal("BDT", asUsd.Currency);
        Assert.Equal("BDT", asEur.Currency);
        Assert.Equal(asUsd.SellPrice, asEur.SellPrice, precision: 2);
        // Stub quotes 200 net + 30 tax USD → ×110 BDT, then 6% + 10 margin: (22000*1.06)+10+3300 = 26630
        Assert.Equal(26630.00, asUsd.SellPrice, precision: 2);
    }

    [Fact]
    public async Task ARevalidateForAConsumer_ComparesTheSellPriceTheyWereShown()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        var client = new OtaCoreService.OtaCoreServiceClient(OtaCoreEngineFactory.GrpcChannelFor(Factory, await ServiceTokenAsync()));
        var ctx = new TenantContext { TenantId = tenant, Channel = ChannelType.B2C };

        var same = await client.RevalidateOfferAsync(new RevalidateRequest { Tenant = ctx, OfferId = offer.OfferId, ExpectedSellPrice = offer.SellPrice });
        var changed = await client.RevalidateOfferAsync(new RevalidateRequest { Tenant = ctx, OfferId = offer.OfferId, ExpectedSellPrice = offer.SellPrice + 5 });

        Assert.True(same.Matches);
        Assert.False(changed.Matches);
        Assert.Equal(0d, same.CurrentNetRate);                       // no cost figure back to a consumer
        Assert.Equal(offer.SellPrice, same.CurrentSellPrice, precision: 2);
    }

    [Fact]
    public async Task ThePassportExpiryTheCustomerTyped_ReachesTheSupplier_BecauseHajeesHoldNeedsIt()
    {
        // The storefront collected it but did not send it, and Hajee's hold answered 500 (the B2B checkout sends it; found by comparing the two).
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);

        Assert.Equal(HttpStatusCode.Created, (await ReserveAsCustomerAsync(tenant, Body(offer.OfferId, travelers: [new { firstName = "Sam", lastName = "Rahman", dateOfBirth = "1990-01-01", documentType = "PASSPORT", documentNumber = PassportNumber, nationality = "BD", title = "mr", gender = "male", passportExpiryDate = "2032-01-31" }]))).Response.StatusCode);

        var sent = Assert.Single(_supplier.LastHold!.Travelers);
        Assert.Equal(("2032-01-31", "BD", "male", "mr"), (sent.PassportExpiryDate, sent.Nationality, sent.Gender, sent.Title));
    }

    [Fact]
    public async Task ANonsenseExpiryDate_IsRefusedBeforeItCanReachTheSupplier()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);

        var (response, _) = await ReserveAsCustomerAsync(tenant, Body(offer.OfferId, travelers: [new { firstName = "Sam", lastName = "Rahman", passportExpiryDate = "next year" }]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, _supplier.Holds);
    }

    [Fact]
    public async Task ASearchForTheQuickSuppliersAndASearchForAllOfThem_AreNeverServedFromTheSameCacheEntry()
    {
        // speed=fast/slow choose WHICH suppliers are searched, so they must be part of the cache key: otherwise the fast-only answer would be
        // replayed for a full search (or the reverse) for the next 90 seconds.
        var tenant = await StorefrontAsync();
        var client = new OtaCoreService.OtaCoreServiceClient(OtaCoreEngineFactory.GrpcChannelFor(Factory, await ServiceTokenAsync()));
        SearchRequest Ask(string? speed)
        {
            var r = new SearchRequest { Tenant = new TenantContext { TenantId = tenant, Channel = ChannelType.B2C }, ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = "2026-12-05", Adults = 1 };
            if (speed is not null) r.Filters["speed"] = speed;
            return r;
        }

        var fast = await client.GetSupplierAvailabilityAsync(Ask("fast"));
        var all = await client.GetSupplierAvailabilityAsync(Ask(null));
        var fastAgain = await client.GetSupplierAvailabilityAsync(Ask("fast"));

        Assert.False(all.CacheHit);                                              // not answered from the fast-only entry
        Assert.True(fastAgain.CacheHit);                                         // but the same kind of search is still cached
        Assert.Equal(fast.Offers[0].OfferId, fastAgain.Offers[0].OfferId);
        Assert.False(_supplier.LastSearchFilters.ContainsKey("speed"));          // the full search reached the supplier without a speed
    }

    // ------------------------------------------------------------------------------------------ offers

    [Fact]
    public async Task AnUnknownOffer_OrAnotherTenantsOffer_IsRefusedTheSameWay_AndHoldsNothing()
    {
        var tenantA = await StorefrontAsync();
        var tenantB = await StorefrontAsync();
        var offerOfA = await SearchAsync(tenantA);

        var (unknown, _) = await ReserveAsCustomerAsync(tenantB, Body("SABRE-doesnotexist"), email: "u@example.test");
        var (foreign, _) = await ReserveAsCustomerAsync(tenantB, Body(offerOfA.OfferId), email: "f@example.test");

        Assert.Equal((HttpStatusCode.Conflict, HttpStatusCode.Conflict), (unknown.StatusCode, foreign.StatusCode));
        Assert.Equal(await unknown.Content.ReadAsStringAsync(), await foreign.Content.ReadAsStringAsync());
        Assert.Equal(0, _supplier.Holds);
    }

    [Fact]
    public async Task IfTheAirlineWillNotHoldTheSeats_NothingIsRecorded()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        _supplier.RefuseHolds = true;

        var (response, _) = await ReserveAsCustomerAsync(tenant, Body(offer.OfferId));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.DoesNotContain("no seats", await response.Content.ReadAsStringAsync());   // the supplier's own words stay in our log
        Assert.Equal(0, await DbAsync(tenant, db => db.Bookings.CountAsync()));
        Assert.Empty(_mail.Sent);
    }

    // ------------------------------------------------------------------------------------------ idempotency

    [Fact]
    public async Task RepeatingARequest_ReturnsTheSameBooking_WithoutAnotherHoldOrEmail()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        var key = Guid.NewGuid().ToString();

        var token = await SignInAsync(tenant, "idem-owner", "GUEST@example.test");
        var first = await Client(tenant, token).PostAsJsonAsync(MyUrl, Body(offer.OfferId, key, email: "GUEST@example.test"));
        var again = await Client(tenant, token).PostAsJsonAsync(MyUrl, Body(offer.OfferId, key, email: "GUEST@example.test"));

        Assert.Equal((HttpStatusCode.Created, HttpStatusCode.OK), (first.StatusCode, again.StatusCode));
        Assert.Equal((await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("booking").GetProperty("id").GetString(), (await again.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("booking").GetProperty("id").GetString());
        Assert.Equal((1, 1), (_supplier.Holds, _mail.Sent.Count)); // one hold mail on create; replay sends nothing more
    }

    [Fact]
    public async Task SomeoneElseUsingTheSameKey_IsToldItIsTaken_AndGivenNothing()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        var key = Guid.NewGuid().ToString();
        await Client(tenant, await SignInAsync(tenant, "idem-owner2", "owner@example.test")).PostAsJsonAsync(MyUrl, Body(offer.OfferId, key, email: "owner@example.test"));

        var stranger = await Client(tenant).PostAsJsonAsync(GuestUrl, Body(offer.OfferId, key, email: "stranger@example.test"));
        var strangerCustomer = await Client(tenant, await SignInAsync(tenant, "idem-1", "c@example.test")).PostAsJsonAsync(MyUrl, Body(offer.OfferId, key));

        Assert.Equal((HttpStatusCode.Unauthorized, HttpStatusCode.Conflict), (stranger.StatusCode, strangerCustomer.StatusCode));
        Assert.DoesNotContain("reference", await strangerCustomer.Content.ReadAsStringAsync());
    }

    // ------------------------------------------------------------------------------------------ a signed-in customer books

    [Fact]
    public async Task ASignedInCustomersBooking_IsTheirs_AndListedWithItsItinerary()
    {
        var tenant = await StorefrontAsync();
        var token = await SignInAsync(tenant, "cust-1", "cust1@example.test");
        var offer = await SearchAsync(tenant);

        var response = await Client(tenant, token).PostAsJsonAsync(MyUrl, Body(offer.OfferId, email: "cust1@example.test"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var row = await DbAsync(tenant, db => db.Bookings.SingleAsync());
        Assert.Equal((BookingChannels.B2C, null, null), (row.Channel, row.GuestEmail, row.AgentId));
        Assert.NotNull(row.CustomerId);
        Assert.Single(_mail.Sent, m => m.Subject.Contains("held", StringComparison.OrdinalIgnoreCase)); // P5-18 hold confirmation
        var list = await (await Client(tenant, token).GetAsync(MyUrl)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("EK", list[0].GetProperty("itinerary")[0].GetProperty("airlineCode").GetString());
    }

    [Fact]
    public async Task AnotherCustomer_DoesNotSeeIt()
    {
        var tenant = await StorefrontAsync();
        var owner = await SignInAsync(tenant, "own-1", "own@example.test");
        var other = await SignInAsync(tenant, "own-2", "other@example.test");
        var offer = await SearchAsync(tenant);
        await Client(tenant, owner).PostAsJsonAsync(MyUrl, Body(offer.OfferId));

        var list = await (await Client(tenant, other).GetAsync(MyUrl)).Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(0, list.GetArrayLength());
    }

    [Fact]
    public async Task TheCustomerEndpoint_RefusesAnAnonymousCaller_AnAgent_AndAService()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        var (_, _, agent) = await TestData.SeedAgentAsync(fixture.Factory);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant).PostAsJsonAsync(MyUrl, Body(offer.OfferId))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, agent).PostAsJsonAsync(MyUrl, Body(offer.OfferId))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client(tenant, await ServiceTokenAsync()).PostAsJsonAsync(MyUrl, Body(offer.OfferId))).StatusCode);
        Assert.Equal(0, _supplier.Holds);
    }

    // ------------------------------------------------------------------------------------------ input and access

    [Theory]
    [InlineData("no-travelers")]
    [InlineData("too-many-travelers")]
    [InlineData("bad-email")]
    [InlineData("no-name")]
    [InlineData("no-key")]
    public async Task BadInput_Is400_AndHoldsNothing(string what)
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        var one = new { firstName = "Sam", lastName = "Rahman" };
        object body = what switch
        {
            "no-travelers" => Body(offer.OfferId, travelers: []),
            "too-many-travelers" => Body(offer.OfferId, travelers: Enumerable.Repeat<object>(one, 10).ToArray()),
            "bad-email" => Body(offer.OfferId, email: "not-an-email"),
            "no-name" => Body(offer.OfferId, travelers: [new { firstName = " ", lastName = "Rahman" }]),
            _ => new { offerId = offer.OfferId, idempotencyKey = "", contactEmail = "a@example.test", travelers = new[] { one } },
        };

        var (response, _) = await ReserveAsCustomerAsync(tenant, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, _supplier.Holds);
    }

    [Fact]
    public async Task GuestCreate_IsUnauthorized_EvenOnAnAgentTenant()
    {
        var (agentTenant, _, _) = await TestData.SeedAgentAsync(fixture.Factory);

        var response = await Client(agentTenant).PostAsJsonAsync(GuestUrl, Body("SABRE-x"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, _supplier.Holds);
    }

    [Fact]
    public void AGuestCanControlExactlyTheBookingTheyProvedAccessTo()
    {
        // P5-20: cancel (and later guest pay paths) may act on the one booking the claim token / lookup granted.
        var guest = new SharedKernel.Caller("t", "B2C", null, SharedKernel.ActorTypes.Guest, GuestBookingId: Guid.NewGuid());
        var owner = new SharedKernel.BookingOwner(null, null, null, guest.GuestBookingId);

        Assert.True(SharedKernel.BookingAccess.CanRead(guest, owner));
        Assert.True(SharedKernel.BookingAccess.CanControl(guest, owner));
        Assert.False(SharedKernel.BookingAccess.CanControl(guest, new SharedKernel.BookingOwner(null, null, null, Guid.NewGuid())));
    }

    [Fact]
    public async Task ABookingDoesNotTouchAnyAgentLedger()
    {
        var tenant = await StorefrontAsync();
        var offer = await SearchAsync(tenant);
        var before = await DbAsync(tenant, db => db.LedgerEntries.CountAsync());

        Assert.Equal(HttpStatusCode.Created, (await ReserveAsCustomerAsync(tenant, Body(offer.OfferId))).Response.StatusCode);

        Assert.Equal(before, await DbAsync(tenant, db => db.LedgerEntries.CountAsync()));
    }
}
