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
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Payments;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Suppliers;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using BookingStatus = Ota.CoreEngine.Domain.BookingStatus;
using ChannelType = Ota.CoreEngine.Grpc.ChannelType;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P5-20: customer / manage-booking cancel — unpaid hold, paid-unticketed refund, Confirmed request + alert.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CancellationTests(OtaCoreEngineFixture fixture)
{
    private sealed class FakeSupplier : ISupplierProvider
    {
        private readonly ConcurrentDictionary<string, decimal> _offers = new();
        public int CancelHoldCalls;
        public string SupplierCode => "SABRE";
        public Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct)
        {
            var id = $"SABRE-{Guid.NewGuid():N}";
            _offers[id] = 200m;
            var dep = new DateTimeOffset(2026, 12, 1, 3, 0, 0, TimeSpan.Zero);
            return Task.FromResult<IReadOnlyList<SupplierOfferResult>>([new SupplierOfferResult(
                id, "SABRE", 200m, "DAC to DXB", "USD",
                [new FlightSegmentResult("EK", "585", "DAC", "DXB", dep, dep.AddHours(5), "Y", 0, "2026-12-01T09:00:00", "2026-12-01T12:00:00")],
                CheckedBaggageIncluded: true, CheckedBaggageWeightKg: 30, TaxAmount: 30m)]);
        }
        public Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) => Task.FromResult<decimal?>(_offers.TryGetValue(offerId, out var n) ? n : null);
        public Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) => Task.FromResult(30m);
        public Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct) =>
            Task.FromResult(_offers.TryGetValue(offerId, out var n) ? new RevalidateResult(n == expectedNetRate, n, null, 30m) : new RevalidateResult(false, 0, "unknown offer"));
        public Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct) =>
            Task.FromResult(new SupplierBookingResult(true, "SUPPLIER-PNR-" + Guid.NewGuid().ToString("N")[..6], null, "{}"));
        public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct) =>
            Task.FromResult(new TicketIssueResult(true, null, "{}"));
        public Task CancelHoldAsync(string supplierCode, string supplierPnrId, CancellationToken ct)
        {
            Interlocked.Increment(ref CancelHoldCalls);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeGateway : IPaymentGateway
    {
        public string Name => PaymentGateways.SslCommerz;
        public string LastTranId = "";
        public decimal LastAmount;
        public string LastCurrency = "";
        public int RefundCalls;

        public Task<GatewayInitResult> InitiateAsync(GatewayInitRequest request, CancellationToken ct)
        {
            LastTranId = request.TranId;
            LastAmount = request.Amount;
            LastCurrency = request.Currency;
            return Task.FromResult(new GatewayInitResult("sess-" + request.TranId, "https://sandbox.sslcommerz.com/EasyCheckOut?token=fake"));
        }

        public Task<GatewayValidationResult> ValidateAsync(GatewayValidationRequest request, CancellationToken ct) =>
            Task.FromResult(new GatewayValidationResult(true, "VALID", LastTranId, LastAmount, LastCurrency, "BANK-1", "{\"status\":\"VALID\"}"));

        public Task<GatewayRefundResult> RefundAsync(GatewayRefundRequest request, CancellationToken ct)
        {
            Interlocked.Increment(ref RefundCalls);
            return Task.FromResult(new GatewayRefundResult(true, "success", "REF-" + request.RefundTranId, null, "{\"status\":\"success\"}"));
        }
    }

    private readonly FakeSupplier _supplier = new();
    private readonly FakeGateway _gateway = new();
    private readonly FakeEmailSender _mail = new();
    private readonly TestIdp _idp = new();
    private WebApplicationFactory<Program>? _factory;

    private WebApplicationFactory<Program> Factory => _factory ??= fixture.Factory.WithWebHostBuilder(b =>
    {
        b.ConfigureAppConfiguration((_, config) =>
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["STOREFRONT_PUBLIC_URL"] = "http://localhost:3001",
                ["SSLCOMMERZ_STORE_ID"] = "test-store",
                ["SSLCOMMERZ_STORE_PASSWORD"] = "test-pass",
                ["SSLCOMMERZ_CORE_PUBLIC_URL"] = "http://localhost:8080",
            }));
        b.ConfigureServices(s =>
        {
            s.RemoveAll<ISupplierProvider>(); s.AddSingleton<ISupplierProvider>(_supplier);
            s.RemoveAll<IExternalIdentityVerifier>(); s.AddSingleton(_idp.Verifier());
            s.RemoveAll<IPaymentGateway>(); s.AddSingleton<IPaymentGateway>(_gateway);
            s.RemoveAll<IEmailSender>(); s.AddSingleton<IEmailSender>(_mail);
        });
    });

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

    private async Task<SupplierOffer> SearchAsync(string tenant)
    {
        var client = new OtaCoreService.OtaCoreServiceClient(OtaCoreEngineFactory.GrpcChannelFor(Factory, await ServiceTokenAsync()));
        var response = await client.GetSupplierAvailabilityAsync(new SearchRequest
        {
            Tenant = new TenantContext { TenantId = tenant, Channel = ChannelType.B2C, Currency = "" },
            ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = "2026-12-01", Adults = 1,
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

    private async Task<string> SignInAsync(string tenant, string sub, string email)
    {
        var r = await Client(tenant).PostAsJsonAsync("/api/v1/auth/customer/social", new { provider = "google", idToken = _idp.IdToken(sub, email, emailVerified: true) });
        r.EnsureSuccessStatusCode();
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
    }

    private async Task<(Guid BookingId, string Token, string Pnr)> ReserveAsync(string tenant, string email = "cancel@example.test")
    {
        var offer = await SearchAsync(tenant);
        var token = await SignInAsync(tenant, "cancel-" + Guid.NewGuid().ToString("N")[..8], email);
        var body = new
        {
            offerId = offer.OfferId,
            idempotencyKey = Guid.NewGuid().ToString(),
            contactEmail = email,
            contactPhone = "+8801700000000",
            expectedTotal = (decimal?)null,
            travelers = new[] { new { firstName = "Sam", lastName = "Rahman", dateOfBirth = "1990-01-01", documentType = "passport", documentNumber = "P7777777", nationality = "bd", passportExpiryDate = "2032-01-31" } },
        };
        var response = await Client(tenant, token).PostAsJsonAsync("/api/v1/customers/me/bookings", body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var booking = json.GetProperty("booking");
        return (booking.GetProperty("id").GetGuid(), token, booking.GetProperty("reference").GetString()!);
    }

    [Fact]
    public async Task Customer_CancelsUnpaidPending_ReleasesHold()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        _supplier.CancelHoldCalls = 0;

        var response = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/cancel", new { reason = "changed plans" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var view = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Cancelled", view.GetProperty("status").GetString());
        Assert.Equal("Completed", view.GetProperty("cancelRequestStatus").GetString());
        Assert.False(view.GetProperty("canRequestCancel").GetBoolean());
        Assert.True(_supplier.CancelHoldCalls >= 1);
        Assert.Equal(0, _gateway.RefundCalls);

        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var row = await db.Bookings.SingleAsync(b => b.Id == bookingId);
        Assert.Equal(BookingStatus.Cancelled, row.Status);
        var cancel = await db.CancellationRequests.SingleAsync(c => c.BookingId == bookingId);
        Assert.Equal(CancellationRequestStatus.Completed, cancel.Status);
        Assert.Equal("changed plans", cancel.CustomerNote);
    }

    [Fact]
    public async Task Customer_CancelsPaidUnticketed_RefundsAndCancels()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);

        // Mark Paid without completing ticketing — Pending + Paid payment.
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            db.Payments.Add(new Payment
            {
                TenantId = tenant,
                BookingId = bookingId,
                Gateway = PaymentGateways.SslCommerz,
                Amount = 212m,
                Currency = "USD",
                Status = PaymentStatus.Paid,
                TranId = "cancel-" + Guid.NewGuid().ToString("N")[..12],
                GatewayRef = "BANK-CANCEL-1",
                PaidAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        _gateway.RefundCalls = 0;
        var response = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/cancel", new { });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var view = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Cancelled", view.GetProperty("status").GetString());
        Assert.Equal(1, _gateway.RefundCalls);

        using var check = TestData.CreateTenantScope(fixture.Factory, tenant);
        var checkDb = check.ServiceProvider.GetRequiredService<OtaDbContext>();
        var payment = await checkDb.Payments.SingleAsync(p => p.BookingId == bookingId);
        Assert.Equal(PaymentStatus.Refunded, payment.Status);
        var refund = await checkDb.Refunds.SingleAsync(r => r.PaymentId == payment.Id);
        Assert.Equal(RefundStatus.Succeeded, refund.Status);
    }

    [Fact]
    public async Task Customer_Confirmed_StoresRequestAndAlerts_DoesNotCancel()
    {
        var tenant = await StorefrontAsync();
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            customerId: null, guestEmail: null);
        // Attach to a signed-in customer.
        var token = await SignInAsync(tenant, "conf-" + Guid.NewGuid().ToString("N")[..8], "confirmed-cancel@example.test");
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            var customerId = await db.Customers.Where(c => c.Email == "confirmed-cancel@example.test").Select(c => c.Id).SingleAsync();
            var row = await db.Bookings.SingleAsync(b => b.Id == booking.Id);
            row.CustomerId = customerId;
            await db.SaveChangesAsync();
        }

        fixture.AlertNotifier.Clear();
        var response = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{booking.Id:D}/cancel", new { reason = "need date change" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var view = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Confirmed", view.GetProperty("status").GetString());
        Assert.Equal("Requested", view.GetProperty("cancelRequestStatus").GetString());
        Assert.False(view.GetProperty("canRequestCancel").GetBoolean());
        Assert.Equal(0, _gateway.RefundCalls);
        Assert.Contains(fixture.AlertNotifier.Calls, c => c.Title.Contains(booking.Pnr, StringComparison.Ordinal));

        // Idempotent: asking again while still Requested returns the same view, not an error.
        var again = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{booking.Id:D}/cancel", new { });
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        using var check = TestData.CreateTenantScope(fixture.Factory, tenant);
        Assert.Equal(1, await check.ServiceProvider.GetRequiredService<OtaDbContext>().CancellationRequests.CountAsync(c => c.BookingId == booking.Id));
    }

    [Fact]
    public async Task Guest_CancelsWithClaimToken()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, _, _) = await ReserveAsync(tenant);
        string claimToken;
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            var booking = await db.Bookings.SingleAsync(b => b.Id == bookingId);
            claimToken = await scope.ServiceProvider.GetRequiredService<IGuestAccessService>().IssueClaimTokenAsync(booking, null, default);
        }

        var response = await Client(tenant).PostAsJsonAsync("/api/v1/guest/bookings/cancel", new
        {
            bookingId,
            claimToken,
            reason = "guest cancel",
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Cancelled", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());

        // Wrong proof → same 404 shape as lookup.
        var bad = await Client(tenant).PostAsJsonAsync("/api/v1/guest/bookings/cancel", new { bookingId, claimToken = "junk" });
        Assert.Equal(HttpStatusCode.NotFound, bad.StatusCode);

        // Reference + surname also works for a fresh unpaid hold.
        var (bookingId2, _, pnr2) = await ReserveAsync(tenant, "guest2@example.test");
        var byName = await Client(tenant).PostAsJsonAsync("/api/v1/guest/bookings/cancel", new
        {
            bookingId = bookingId2,
            reference = pnr2,
            lastName = "Rahman",
        });
        Assert.Equal(HttpStatusCode.OK, byName.StatusCode);
        Assert.Equal("Cancelled", (await byName.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
    }

    [Fact]
    public async Task MyBookings_IncludesCancelFields()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);

        var list = await Client(tenant, token).GetAsync("/api/v1/customers/me/bookings");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var rows = await list.Content.ReadFromJsonAsync<JsonElement>();
        var mine = rows.EnumerateArray().First(b => b.GetProperty("id").GetGuid() == bookingId);
        Assert.True(mine.GetProperty("canRequestCancel").GetBoolean());
        Assert.Equal(JsonValueKind.Null, mine.GetProperty("cancelRequestStatus").ValueKind);
    }

    [Fact]
    public async Task Customer_CannotCancelTwice_AfterCompleted()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);

        var first = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/cancel", new { });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/cancel", new { });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        var body = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("cancel_not_allowed", body.GetProperty("error").GetString());
    }
}
