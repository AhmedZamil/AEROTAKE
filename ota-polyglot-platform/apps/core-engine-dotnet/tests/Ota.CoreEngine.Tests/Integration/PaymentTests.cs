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
using ChannelType = Ota.CoreEngine.Grpc.ChannelType;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P4-3 / P4-4 / P4-5: start SSLCommerz checkout; IPN validates, marks Paid, tickets (or refunds on ticket failure).</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class PaymentTests(OtaCoreEngineFixture fixture)
{
    private sealed class FakeSupplier : ISupplierProvider
    {
        private readonly ConcurrentDictionary<string, decimal> _offers = new();
        public bool FailTicket;
        public bool UnknownTicket;
        public int TicketCalls;
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
        public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct)
        {
            Interlocked.Increment(ref TicketCalls);
            if (UnknownTicket)
                return Task.FromResult(new TicketIssueResult(false, "timed out", "{}") { Outcome = TicketIssueOutcome.Unknown });
            return Task.FromResult(FailTicket
                ? new TicketIssueResult(false, "forced ticket failure", "{}")
                : new TicketIssueResult(true, null, "{}"));
        }
        public Task CancelHoldAsync(string supplierCode, string supplierPnrId, CancellationToken ct) => Task.CompletedTask;
    }

    private sealed class FakeGateway : IPaymentGateway
    {
        public string Name => PaymentGateways.SslCommerz;
        public bool FailNextInit;
        public string LastTranId = "";
        public string LastCurrency = "";
        public string LastSuccessUrl = "";
        public string LastFailUrl = "";
        public string LastCancelUrl = "";
        public decimal LastAmount;
        public decimal? ValidateAmountOverride;
        public int RefundCalls;
        public string? LastRefundBankTranId;

        public Task<GatewayInitResult> InitiateAsync(GatewayInitRequest request, CancellationToken ct)
        {
            if (FailNextInit)
            {
                FailNextInit = false;
                throw new ServiceException(ErrorKind.FailedPrecondition, "Payment gateway could not start the session.");
            }
            LastTranId = request.TranId;
            LastAmount = request.Amount;
            LastCurrency = request.Currency;
            LastSuccessUrl = request.SuccessUrl;
            LastFailUrl = request.FailUrl;
            LastCancelUrl = request.CancelUrl;
            return Task.FromResult(new GatewayInitResult("sess-" + request.TranId, "https://sandbox.sslcommerz.com/EasyCheckOut?token=fake"));
        }

        public Task<GatewayValidationResult> ValidateAsync(GatewayValidationRequest request, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(request.ValId))
                return Task.FromResult(new GatewayValidationResult(false, "INVALID", LastTranId, 0m, LastCurrency, null, "{}"));
            var amount = ValidateAmountOverride ?? LastAmount;
            return Task.FromResult(new GatewayValidationResult(true, "VALID", LastTranId, amount, LastCurrency, "BANK-1", "{\"status\":\"VALID\"}"));
        }

        public Task<GatewayRefundResult> RefundAsync(GatewayRefundRequest request, CancellationToken ct)
        {
            Interlocked.Increment(ref RefundCalls);
            LastRefundBankTranId = request.BankTranId;
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
            ProductType = ProductType.Flight, Origin = "DAC", Destination = "DXB", CheckIn = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(400 + Random.Shared.Next(8000))).ToString("yyyy-MM-dd"), Adults = 1,
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

    private async Task<(Guid BookingId, string Token, decimal Total)> ReserveAsync(string tenant)
    {
        var offer = await SearchAsync(tenant);
        var token = await SignInAsync(tenant, "pay-" + Guid.NewGuid().ToString("N")[..8], "pay@example.test");
        var body = new
        {
            offerId = offer.OfferId,
            idempotencyKey = Guid.NewGuid().ToString(),
            contactEmail = "pay@example.test",
            contactPhone = "+8801700000000",
            expectedTotal = (decimal?)null,
            travelers = new[] { new { firstName = "Sam", lastName = "Rahman", dateOfBirth = "1990-01-01", documentType = "passport", documentNumber = "P7777777", nationality = "bd", passportExpiryDate = "2032-01-31" } },
        };
        var response = await Client(tenant, token).PostAsJsonAsync("/api/v1/customers/me/bookings", body);
        if (response.StatusCode != HttpStatusCode.Created)
            Assert.Fail(await response.Content.ReadAsStringAsync());
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var booking = json.GetProperty("booking");
        return (booking.GetProperty("id").GetGuid(), token, booking.GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task PayStart_BrowserReturnUrls_GoThroughStorefrontPostHandler()
    {
        // SSLCommerz POSTs val_id to success_url; the storefront page is GET-only, so pay must point at the BFF forwarder.
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        var start = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);

        // Fake gateway records the init request URLs via LastTranId only — assert from the gateway form by re-reading Initiate through a spy.
        // Success URL shape is fixed in PaymentService; verify the live gateway call used the browser-return path.
        Assert.Contains($"/api/payments/sslcommerz/browser-return?status=success&bookingId={bookingId:D}", _gateway.LastSuccessUrl, StringComparison.Ordinal);
        Assert.Contains($"/api/payments/sslcommerz/browser-return?status=fail&bookingId={bookingId:D}", _gateway.LastFailUrl, StringComparison.Ordinal);
        Assert.Contains($"/api/payments/sslcommerz/browser-return?status=cancel&bookingId={bookingId:D}", _gateway.LastCancelUrl, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PayStart_ReturnsGatewayUrl_AndReplaysOnSameIdempotencyKey()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        var key = "idem-" + Guid.NewGuid().ToString("N");

        var first = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = key });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var a = await first.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(a.GetProperty("replayed").GetBoolean());
        Assert.StartsWith("https://sandbox.sslcommerz.com/", a.GetProperty("gatewayUrl").GetString());

        var second = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = key });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var b = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(b.GetProperty("replayed").GetBoolean());
        Assert.Equal(a.GetProperty("paymentId").GetGuid(), b.GetProperty("paymentId").GetGuid());
        Assert.Equal(a.GetProperty("gatewayUrl").GetString(), b.GetProperty("gatewayUrl").GetString());
    }

    [Fact]
    public async Task PayStart_AfterFailedInit_SameKeyAsksForRetry_NewKeyStartsCheckout()
    {
        _gateway.FailNextInit = true;
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        var deadKey = "dead-" + Guid.NewGuid().ToString("N");

        var failed = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = deadKey });
        Assert.Equal(HttpStatusCode.Conflict, failed.StatusCode);

        var again = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = deadKey });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("payment_retry_required", (await again.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());

        var fresh = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = "fresh-" + Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.OK, fresh.StatusCode);
        var started = await fresh.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(started.GetProperty("replayed").GetBoolean());
        Assert.StartsWith("https://sandbox.sslcommerz.com/", started.GetProperty("gatewayUrl").GetString());
    }

    [Fact]
    public async Task PayStart_AfterPaid_RefusesAnotherCheckout()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        var start = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        var started = await start.Content.ReadFromJsonAsync<JsonElement>();
        var ipnClient = Factory.CreateClient();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-ok",
            ["tran_id"] = started.GetProperty("tranId").GetString()!,
        });
        Assert.Equal(HttpStatusCode.OK, (await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", form)).StatusCode);
        Assert.Equal(1, _supplier.TicketCalls);

        var again = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal(1, _supplier.TicketCalls);
    }

    [Fact]
    public async Task Ipn_WithoutTenantHeader_MarksPaymentPaid_AndConfirmsBooking()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, total) = await ReserveAsync(tenant);
        var start = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(total, _gateway.LastAmount);

        // No X-Tenant-ID — mirrors SSLCommerz posting to our public IPN URL.
        var ipnClient = Factory.CreateClient();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-ok",
            ["tran_id"] = started.GetProperty("tranId").GetString()!,
        });
        var ipn = await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", form);
        Assert.Equal(HttpStatusCode.OK, ipn.StatusCode);
        var body = await ipn.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("valid").GetBoolean());

        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var payment = await db.Payments.SingleAsync(p => p.BookingId == bookingId);
        Assert.Equal(PaymentStatus.Paid, payment.Status);
        Assert.Equal("BANK-1", payment.GatewayRef);
        Assert.NotNull(payment.PaidAt);
        var booking = await db.Bookings.SingleAsync(b => b.Id == bookingId);
        Assert.Equal(Domain.BookingStatus.Confirmed, booking.Status);
        Assert.Equal(1, _supplier.TicketCalls);
        Assert.Equal(0, _gateway.RefundCalls);

        Assert.Contains(_mail.Sent, m => m.Subject.Contains("held", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(_mail.Sent, m => m.Subject.Contains("Payment received", StringComparison.OrdinalIgnoreCase)
                                         && m.Body.Contains("http://localhost:3001/my-bookings"));
        Assert.Contains(_mail.Sent, m => m.Subject.Contains("e-ticket", StringComparison.OrdinalIgnoreCase)
                                         && m.Body.Contains(booking.Pnr)
                                         && m.Body.Contains($"/booking/itinerary/{booking.Id:D}", StringComparison.Ordinal)
                                         && m.Body.Contains("#claim=", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Ipn_WhenTicketFails_RefundsPayment_AndFailsBooking()
    {
        _supplier.FailTicket = true;
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        var start = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<JsonElement>();

        var ipnClient = Factory.CreateClient();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-ok",
            ["tran_id"] = started.GetProperty("tranId").GetString()!,
        });
        var ipn = await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", form);
        Assert.Equal(HttpStatusCode.OK, ipn.StatusCode);

        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var payment = await db.Payments.SingleAsync(p => p.BookingId == bookingId);
        Assert.Equal(PaymentStatus.Refunded, payment.Status);
        var booking = await db.Bookings.SingleAsync(b => b.Id == bookingId);
        Assert.Equal(Domain.BookingStatus.Failed, booking.Status);
        var refund = await db.Refunds.SingleAsync(r => r.PaymentId == payment.Id);
        Assert.Equal(RefundStatus.Succeeded, refund.Status);
        Assert.Equal("ticket_failed", refund.Reason);
        Assert.Equal(1, _gateway.RefundCalls);
        Assert.Equal("BANK-1", _gateway.LastRefundBankTranId);

        Assert.Contains(_mail.Sent, m => m.Subject.Contains("Payment received", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(_mail.Sent, m => m.Subject.Contains("Update on booking", StringComparison.OrdinalIgnoreCase)
                                         && m.Body.Contains("could not issue the ticket", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(_mail.Sent, m => m.Subject.Contains("e-ticket", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Ipn_WhenTicketOutcomeIsUnknown_LeavesPaidAndPending_AndDoesNotIssueAgain()
    {
        _supplier.UnknownTicket = true;
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        var start = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<JsonElement>();

        var ipnClient = Factory.CreateClient();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-ok",
            ["tran_id"] = started.GetProperty("tranId").GetString()!,
        });
        Assert.Equal(HttpStatusCode.OK, (await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", form)).StatusCode);

        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            var payment = await db.Payments.SingleAsync(p => p.BookingId == bookingId);
            Assert.Equal(PaymentStatus.Paid, payment.Status);
            var booking = await db.Bookings.SingleAsync(b => b.Id == bookingId);
            Assert.Equal(Domain.BookingStatus.Pending, booking.Status);
            var attempt = await db.PaymentAttempts.SingleAsync(a => a.PaymentId == payment.Id);
            Assert.Equal(PaidBookingCompleter.TicketingUnknownMarker, attempt.FailureReason);
            Assert.Empty(await db.Refunds.Where(r => r.PaymentId == payment.Id).ToListAsync());
        }
        Assert.Equal(1, _supplier.TicketCalls);
        Assert.Equal(0, _gateway.RefundCalls);

        using var replay = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-ok",
            ["tran_id"] = started.GetProperty("tranId").GetString()!,
        });
        Assert.Equal(HttpStatusCode.OK, (await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", replay)).StatusCode);
        Assert.Equal(1, _supplier.TicketCalls);
        Assert.Equal(0, _gateway.RefundCalls);
    }

    [Fact]
    public async Task Ipn_ReplayAfterConfirm_DoesNotTicketOrRefundTwice()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        var start = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        var started = await start.Content.ReadFromJsonAsync<JsonElement>();
        var ipnClient = Factory.CreateClient();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-ok",
            ["tran_id"] = started.GetProperty("tranId").GetString()!,
        });
        Assert.Equal(HttpStatusCode.OK, (await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", form)).StatusCode);
        Assert.Equal(1, _supplier.TicketCalls);
        var mailsAfterFirst = _mail.Sent.Count;

        using var form2 = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-ok",
            ["tran_id"] = started.GetProperty("tranId").GetString()!,
        });
        Assert.Equal(HttpStatusCode.OK, (await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", form2)).StatusCode);
        Assert.Equal(1, _supplier.TicketCalls);
        Assert.Equal(0, _gateway.RefundCalls);
        Assert.Equal(mailsAfterFirst, _mail.Sent.Count); // no second payment/ticket email on IPN replay
    }

    [Fact]
    public async Task Ipn_WithMismatchedAmount_MarksFailed_AndDoesNotPay()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        _gateway.ValidateAmountOverride = 1.00m;

        var ipnClient = Factory.CreateClient();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-bad",
            ["tran_id"] = _gateway.LastTranId,
        });
        var ipn = await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", form);
        Assert.Equal(HttpStatusCode.OK, ipn.StatusCode);
        Assert.False((await ipn.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("valid").GetBoolean());

        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var payment = await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Payments.SingleAsync(p => p.BookingId == bookingId);
        Assert.Equal(PaymentStatus.Failed, payment.Status);
        Assert.Contains(_mail.Sent, m => m.Subject.Contains("Update on booking", StringComparison.OrdinalIgnoreCase)
                                         && m.Body.Contains("payment was not completed", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task SmtpFailure_DoesNotBreakSuccessfulIpnTicketing()
    {
        _mail.Fail = true;
        var tenant = await StorefrontAsync();
        var (bookingId, token, _) = await ReserveAsync(tenant);
        // Reserve may have thrown into FakeEmailSender already — booking must still exist.
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
            Assert.Equal(Domain.BookingStatus.Pending, (await scope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings.SingleAsync(b => b.Id == bookingId)).Status);

        var start = await Client(tenant, token).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<JsonElement>();
        var ipnClient = Factory.CreateClient();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-ok",
            ["tran_id"] = started.GetProperty("tranId").GetString()!,
        });
        Assert.Equal(HttpStatusCode.OK, (await ipnClient.PostAsync("/api/v1/payments/sslcommerz/ipn", form)).StatusCode);

        using var confirmScope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var booking = await confirmScope.ServiceProvider.GetRequiredService<OtaDbContext>().Bookings.SingleAsync(b => b.Id == bookingId);
        Assert.Equal(Domain.BookingStatus.Confirmed, booking.Status);
        Assert.Equal(1, _supplier.TicketCalls);
    }

    [Fact]
    public async Task PayStart_ForSomeoneElsesBooking_IsNotFound()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, _, _) = await ReserveAsync(tenant);
        var stranger = await SignInAsync(tenant, "stranger", "stranger@example.test");

        var response = await Client(tenant, stranger).PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task WalletPay_NeedsEnoughBalance_ThenTicketsWithoutTheCardGateway()
    {
        var tenant = await StorefrontAsync();
        var (bookingId, token, total) = await ReserveAsync(tenant);
        var client = Client(tenant, token);

        var empty = await client.GetFromJsonAsync<JsonElement>("/api/v1/customers/me/wallet");
        Assert.Equal(0m, empty.GetProperty("balance").GetDecimal());

        var shortPay = await client.PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N"), method = "wallet" });
        var shortBody = await shortPay.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(shortPay.StatusCode == HttpStatusCode.Conflict, shortBody.ToString());
        Assert.Equal("wallet_insufficient", shortBody.GetProperty("error").GetString());
        Assert.Equal(0, _gateway.RefundCalls);

        var topUp = await client.PostAsJsonAsync("/api/v1/customers/me/wallet/top-up", new { amount = total });
        Assert.Equal(HttpStatusCode.OK, topUp.StatusCode);

        var paid = await client.PostAsJsonAsync($"/api/v1/customers/me/bookings/{bookingId:D}/pay", new { idempotencyKey = Guid.NewGuid().ToString("N"), method = "wallet" });
        Assert.Equal(HttpStatusCode.OK, paid.StatusCode);
        var body = await paid.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("paid").GetBoolean());
        Assert.Equal("wallet", body.GetProperty("method").GetString());
        Assert.Equal("Confirmed", body.GetProperty("bookingStatus").GetString());
        Assert.Equal(0, _gateway.RefundCalls);

        var after = await client.GetFromJsonAsync<JsonElement>("/api/v1/customers/me/wallet");
        Assert.Equal(0m, after.GetProperty("balance").GetDecimal());
    }

    [Fact]
    public async Task CardTopUp_CreditsTheWalletOnlyAfterTheGatewayConfirms_AndOnlyOnce()
    {
        var tenant = await StorefrontAsync();
        var token = await SignInAsync(tenant, "topup-" + Guid.NewGuid().ToString("N")[..8], "topup@example.test");
        var client = Client(tenant, token);

        var start = await client.PostAsJsonAsync("/api/v1/customers/me/wallet/top-up/card", new { amount = 500m, idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<JsonElement>();
        var topUpId = started.GetProperty("topUpId").GetGuid();
        Assert.Contains($"topUpId={topUpId:D}", _gateway.LastSuccessUrl, StringComparison.Ordinal);

        var before = await client.GetFromJsonAsync<JsonElement>("/api/v1/customers/me/wallet");
        Assert.Equal(0m, before.GetProperty("balance").GetDecimal());

        var ipn = Factory.CreateClient();
        var tranId = _gateway.LastTranId;
        FormUrlEncodedContent Form() => new(new Dictionary<string, string> { ["val_id"] = "val-topup", ["tran_id"] = tranId });
        Assert.Equal(HttpStatusCode.OK, (await ipn.PostAsync("/api/v1/payments/sslcommerz/ipn", Form())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ipn.PostAsync("/api/v1/payments/sslcommerz/ipn", Form())).StatusCode);

        var after = await client.GetFromJsonAsync<JsonElement>("/api/v1/customers/me/wallet");
        Assert.Equal(500m, after.GetProperty("balance").GetDecimal());

        _gateway.ValidateAmountOverride = 1m;
        var mismatch = await client.PostAsJsonAsync("/api/v1/customers/me/wallet/top-up/card", new { amount = 200m, idempotencyKey = Guid.NewGuid().ToString("N") });
        Assert.Equal(HttpStatusCode.OK, mismatch.StatusCode);
        using var bad = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["val_id"] = "val-bad",
            ["tran_id"] = _gateway.LastTranId,
        });
        Assert.Equal(HttpStatusCode.OK, (await ipn.PostAsync("/api/v1/payments/sslcommerz/ipn", bad)).StatusCode);
        var still = await client.GetFromJsonAsync<JsonElement>("/api/v1/customers/me/wallet");
        Assert.Equal(500m, still.GetProperty("balance").GetDecimal());
    }
}
