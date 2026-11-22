using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Payments;
using Ota.CoreEngine.Suppliers;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;
using BookingStatus = Ota.CoreEngine.Domain.BookingStatus;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P5-30: platform admin lists open cancel requests and completes (refund) or rejects them.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class AdminCancellationTests(OtaCoreEngineFixture fixture)
{
    private sealed class CountingSupplier : ISupplierProvider
    {
        public int CancelHoldCalls;
        public string SupplierCode => "SABRE";
        public Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<SupplierOfferResult>>([]);
        public Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) => Task.FromResult<decimal?>(null);
        public Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) => Task.FromResult(0m);
        public Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct) =>
            Task.FromResult(new RevalidateResult(false, 0, "unused"));
        public Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct) =>
            Task.FromResult(new SupplierBookingResult(false, null, "unused", "{}"));
        public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct) =>
            Task.FromResult(new TicketIssueResult(false, "unused", "{}"));
        public Task CancelHoldAsync(string supplierCode, string supplierPnrId, CancellationToken ct)
        {
            Interlocked.Increment(ref CancelHoldCalls);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeGateway : IPaymentGateway
    {
        public string Name => PaymentGateways.SslCommerz;
        public int RefundCalls;
        public bool RefundOk = true;

        public Task<GatewayInitResult> InitiateAsync(GatewayInitRequest request, CancellationToken ct) =>
            Task.FromResult(new GatewayInitResult("sess", "https://example.test/pay"));
        public Task<GatewayValidationResult> ValidateAsync(GatewayValidationRequest request, CancellationToken ct) =>
            Task.FromResult(new GatewayValidationResult(true, "VALID", "t", 1m, "BDT", "BANK", "{}"));
        public Task<GatewayRefundResult> RefundAsync(GatewayRefundRequest request, CancellationToken ct)
        {
            Interlocked.Increment(ref RefundCalls);
            return Task.FromResult(RefundOk
                ? new GatewayRefundResult(true, "success", "REF-" + request.RefundTranId, null, "{\"status\":\"success\"}")
                : new GatewayRefundResult(false, "FAILED", null, "declined", "{\"status\":\"FAILED\"}"));
        }
    }

    private readonly CountingSupplier _supplier = new();
    private readonly FakeGateway _gateway = new();
    private WebApplicationFactory<Program>? _factory;

    private WebApplicationFactory<Program> Factory => _factory ??= fixture.Factory.WithWebHostBuilder(b =>
        b.ConfigureServices(s =>
        {
            s.RemoveAll<ISupplierProvider>();
            s.AddSingleton<ISupplierProvider>(_supplier);
            s.RemoveAll<IPaymentGateway>();
            s.AddSingleton<IPaymentGateway>(_gateway);
        }));

    [Fact]
    public async Task List_IsTenantScoped_AndHidesCostAndPassport()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var other = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var mine = await SeedRequestedAsync(tenant, "mine-note");
        await SeedRequestedAsync(other, "other-note");
        var admin = AdminClient(await TestData.SeedAdminUserAsync(fixture.Factory, tenant));

        var response = await admin.GetAsync("/api/v1/admin/cancellation-requests?status=Requested&channel=B2C");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("P9999999", body, StringComparison.Ordinal);
        Assert.DoesNotContain("supplierNetRate", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("agentMarkupPercent", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("subAgentMargin", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SUPPLIER-SECRET-REF", body, StringComparison.Ordinal);

        var json = JsonDocument.Parse(body).RootElement;
        Assert.Equal(1, json.GetProperty("totalCount").GetInt32());
        var item = json.GetProperty("items").EnumerateArray().Single();
        Assert.Equal(mine.Id, item.GetProperty("id").GetGuid());
        Assert.Equal("Sam Rahman", item.GetProperty("travelers").EnumerateArray().Single().GetString());
        Assert.Equal("mine-note", item.GetProperty("customerNote").GetString());
        Assert.DoesNotContain("other-note", body, StringComparison.Ordinal);

        var b2b = await admin.GetAsync("/api/v1/admin/cancellation-requests?status=Requested&channel=B2B_AGENT");
        Assert.Equal(0, (await b2b.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Complete_RefundsAndCancels_WithoutCallingSupplierHoldCancel()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var request = await SeedRequestedAsync(tenant, withPayment: true);
        _gateway.RefundCalls = 0;
        _supplier.CancelHoldCalls = 0;
        var admin = AdminClient(await TestData.SeedAdminUserAsync(fixture.Factory, tenant));

        var response = await admin.PostAsJsonAsync($"/api/v1/admin/cancellation-requests/{request.Id}/complete", new { note = "voided with airline" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var item = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Completed", item.GetProperty("status").GetString());
        Assert.Equal("Cancelled", item.GetProperty("bookingStatus").GetString());
        Assert.Equal("Refunded", item.GetProperty("paymentStatus").GetString());
        Assert.Equal("Succeeded", item.GetProperty("refundStatus").GetString());
        Assert.Equal(1, _gateway.RefundCalls);
        Assert.Equal(0, _supplier.CancelHoldCalls);

        var again = await admin.PostAsJsonAsync($"/api/v1/admin/cancellation-requests/{request.Id}/complete", new { });
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(1, _gateway.RefundCalls);

        using var check = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = check.ServiceProvider.GetRequiredService<OtaDbContext>();
        var booking = await db.Bookings.SingleAsync(b => b.Id == request.BookingId);
        Assert.Equal(BookingStatus.Cancelled, booking.Status);
        Assert.Equal("voided with airline", (await db.CancellationRequests.SingleAsync(c => c.Id == request.Id)).OpsNote);
    }

    [Fact]
    public async Task Complete_WhenRefundFails_LeavesTheRequestOpen()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var request = await SeedRequestedAsync(tenant, withPayment: true);
        _gateway.RefundOk = false;
        fixture.AlertNotifier.Clear();
        var admin = AdminClient(await TestData.SeedAdminUserAsync(fixture.Factory, tenant));

        var response = await admin.PostAsJsonAsync($"/api/v1/admin/cancellation-requests/{request.Id}/complete", new { note = "tried" });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("refund_failed", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
        Assert.Contains(fixture.AlertNotifier.Calls, c => c.Title.Contains("refund failed", StringComparison.OrdinalIgnoreCase));

        using var check = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = check.ServiceProvider.GetRequiredService<OtaDbContext>();
        Assert.Equal(BookingStatus.Confirmed, (await db.Bookings.SingleAsync(b => b.Id == request.BookingId)).Status);
        Assert.Equal(CancellationRequestStatus.Requested, (await db.CancellationRequests.SingleAsync(c => c.Id == request.Id)).Status);
        _gateway.RefundOk = true;
    }

    [Fact]
    public async Task Reject_LeavesTheBooking_AndRequiresAReason()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var request = await SeedRequestedAsync(tenant);
        var admin = AdminClient(await TestData.SeedAdminUserAsync(fixture.Factory, tenant));

        var missing = await admin.PostAsJsonAsync($"/api/v1/admin/cancellation-requests/{request.Id}/reject", new { });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);

        var response = await admin.PostAsJsonAsync($"/api/v1/admin/cancellation-requests/{request.Id}/reject", new { note = "fare is non-refundable" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Rejected", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());

        var completed = await admin.PostAsJsonAsync($"/api/v1/admin/cancellation-requests/{request.Id}/complete", new { });
        Assert.Equal(HttpStatusCode.Conflict, completed.StatusCode);

        using var check = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = check.ServiceProvider.GetRequiredService<OtaDbContext>();
        Assert.Equal(BookingStatus.Confirmed, (await db.Bookings.SingleAsync(b => b.Id == request.BookingId)).Status);
    }

    [Fact]
    public async Task AnotherTenant_AndAnAgencyAdmin_CannotResolve()
    {
        var tenant = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var other = await TestData.RegisterB2CTenantAsync(fixture.Factory);
        var request = await SeedRequestedAsync(tenant);
        var outsider = AdminClient(await TestData.SeedAdminUserAsync(fixture.Factory, other));
        var missing = await outsider.PostAsJsonAsync($"/api/v1/admin/cancellation-requests/{request.Id}/reject", new { note = "no" });
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var (_, agencyToken) = await TestData.SeedAgentUserAsync(fixture.Factory, tenant, UserRole.AgencyAdmin);
        var agency = AdminClient(agencyToken);
        var forbidden = await agency.GetAsync("/api/v1/admin/cancellation-requests");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    private HttpClient AdminClient(string accessToken)
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", accessToken);
        return client;
    }

    private async Task<CancellationRequest> SeedRequestedAsync(string tenant, string? customerNote = "please cancel", bool withPayment = false)
    {
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(), guestEmail: "guest@example.test");
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        if (withPayment)
        {
            db.Payments.Add(new Payment
            {
                TenantId = tenant,
                BookingId = booking.Id,
                Amount = booking.FinalPrice,
                Currency = booking.Currency,
                Status = PaymentStatus.Paid,
                TranId = Guid.NewGuid().ToString("N"),
                GatewayRef = "BANK-" + Guid.NewGuid().ToString("N")[..8],
                PaidAt = DateTimeOffset.UtcNow,
            });
        }

        var request = new CancellationRequest
        {
            TenantId = tenant,
            BookingId = booking.Id,
            Status = CancellationRequestStatus.Requested,
            CustomerNote = customerNote,
        };
        db.CancellationRequests.Add(request);
        await db.SaveChangesAsync();
        return request;
    }
}
