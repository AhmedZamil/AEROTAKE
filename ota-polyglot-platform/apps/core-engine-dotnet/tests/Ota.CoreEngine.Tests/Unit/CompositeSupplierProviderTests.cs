using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Suppliers;

namespace Ota.CoreEngine.Tests.Unit;

public class CompositeSupplierProviderTests
{
    private sealed class FakeSupplier(string code) : ISupplierProvider
    {
        public string SupplierCode => code;
        public bool IsSlowSearch { get; set; }
        public Func<CancellationToken, Task<IReadOnlyList<SupplierOfferResult>>> Search { get; set; } = _ => Task.FromResult<IReadOnlyList<SupplierOfferResult>>([]);
        public Func<string, decimal, RevalidateResult> Revalidate { get; set; } = (_, _) => new RevalidateResult(true, 100, null);
        public Dictionary<string, decimal> CachedNet { get; } = [];
        public List<string> Calls { get; } = [];

        public Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct) => Search(ct);
        public Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) =>
            Task.FromResult<decimal?>(CachedNet.TryGetValue(offerId, out var n) ? n : null);
        public Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) => Task.FromResult(0m);
        public Task<RevalidateResult> RevalidateAsync(string offerId, decimal expected, CancellationToken ct)
        {
            Calls.Add("revalidate:" + offerId);
            return Task.FromResult(Revalidate(offerId, expected));
        }
        public Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct)
        {
            Calls.Add("book:" + request.OfferId);
            return Task.FromResult(new SupplierBookingResult(true, code + "-PNR", null, "{}"));
        }
        public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct)
        {
            Calls.Add("ticket:" + supplierPnrId);
            return Task.FromResult(new TicketIssueResult(true, null, "{}"));
        }
    }

    private sealed class FakeAlternates(Dictionary<string, string[]>? map = null) : IOfferAlternatesReader
    {
        public Task<IReadOnlyList<string>> GetAsync(string winner) =>
            Task.FromResult<IReadOnlyList<string>>(map is not null && map.TryGetValue(winner, out var v) ? v : []);
    }

    private static CompositeSupplierProvider Composite(FakeAlternates? alt = null, TimeSpan? deadline = null, params ISupplierProvider[] providers) =>
        new(providers, alt ?? new FakeAlternates(), NullLogger<CompositeSupplierProvider>.Instance)
        { SearchDeadline = deadline ?? TimeSpan.FromSeconds(5) };

    private static Task<IReadOnlyList<SupplierOfferResult>> Offers(params string[] ids) =>
        Task.FromResult<IReadOnlyList<SupplierOfferResult>>(ids.Select(id => OfferMergerTests.Offer(id, id.Split('-')[0], 100, flight: "BS" + (100 + id.Length))).ToList());

    private static readonly SearchRequest Request = new() { Origin = "DAC", Destination = "CXB", CheckIn = "2026-10-25", Adults = 1 };

    // ---- speed=fast / speed=slow: the quick suppliers answer first, the slow one is asked for separately with its own time limit

    private static SearchRequest WithSpeed(string speed) { var r = Request.Clone(); r.Filters["speed"] = speed; return r; }

    [Fact]
    public async Task A_fast_search_asks_only_the_quick_suppliers_and_never_waits_for_the_slow_one()
    {
        var sabre = new FakeSupplier("SABRE") { Search = _ => Offers("SABRE-1") };
        var hajee = new FakeSupplier("HAJEE") { IsSlowSearch = true, Search = async ct => { await Task.Delay(Timeout.Infinite, ct); return []; } };
        var composite = new CompositeSupplierProvider([sabre, hajee], new FakeAlternates(), NullLogger<CompositeSupplierProvider>.Instance) { FastSearchDeadline = TimeSpan.FromSeconds(5) };

        var started = DateTime.UtcNow;
        var outcome = await composite.SearchWithWarningsAsync(WithSpeed("fast"), default);

        Assert.Equal(["SABRE-1"], outcome.Offers.Select(o => o.OfferId));
        Assert.Empty(outcome.Warnings);                                          // the slow supplier was not asked, so it did not "fail"
        Assert.True(DateTime.UtcNow - started < TimeSpan.FromSeconds(2));
    }

    [Fact]
    public async Task A_slow_search_asks_only_the_slow_suppliers_and_gives_them_their_own_longer_limit()
    {
        var sabre = new FakeSupplier("SABRE") { Search = _ => throw new InvalidOperationException("must not be asked") };
        var hajee = new FakeSupplier("HAJEE") { IsSlowSearch = true, Search = async ct => { await Task.Delay(1500, ct); return await Offers("HAJEE-22"); } };
        // the ordinary limit is shorter than this supplier's answer; the slow limit is not
        var composite = new CompositeSupplierProvider([sabre, hajee], new FakeAlternates(), NullLogger<CompositeSupplierProvider>.Instance)
        { SearchDeadline = TimeSpan.FromMilliseconds(300), SlowSearchDeadline = TimeSpan.FromSeconds(10) };

        var slow = await composite.SearchWithWarningsAsync(WithSpeed("slow"), default);
        var all = await composite.SearchWithWarningsAsync(Request, default);

        Assert.Equal(["HAJEE-22"], slow.Offers.Select(o => o.OfferId));
        Assert.Empty(slow.Warnings);
        Assert.Contains(all.Warnings, w => w.StartsWith("Hajee"));                // with no speed given, the old behaviour: everyone, one (short) deadline
    }

    [Fact]
    public async Task With_no_speed_every_supplier_is_asked_as_before()
    {
        var sabre = new FakeSupplier("SABRE") { Search = _ => Offers("SABRE-1") };
        var hajee = new FakeSupplier("HAJEE") { IsSlowSearch = true, Search = _ => Offers("HAJEE-22") };

        var outcome = await Composite(null, null, sabre, hajee).SearchWithWarningsAsync(Request, default);

        Assert.Equal(2, outcome.Offers.Count);
    }

    [Fact]
    public async Task Both_suppliers_answer_and_both_contribute_with_no_warnings()
    {
        var sabre = new FakeSupplier("SABRE") { Search = _ => Offers("SABRE-1") };
        var hajee = new FakeSupplier("HAJEE") { Search = _ => Offers("HAJEE-22") };

        var outcome = await Composite(null, null, sabre, hajee).SearchWithWarningsAsync(Request, default);

        Assert.Equal(2, outcome.Offers.Count);
        Assert.Empty(outcome.Warnings);
    }

    [Fact]
    public async Task A_failing_supplier_does_not_fail_the_search_and_produces_a_warning()
    {
        var sabre = new FakeSupplier("SABRE") { Search = _ => Offers("SABRE-1") };
        var hajee = new FakeSupplier("HAJEE") { Search = _ => throw new HttpRequestException("boom") };

        var outcome = await Composite(null, null, sabre, hajee).SearchWithWarningsAsync(Request, default);

        Assert.Equal("SABRE-1", Assert.Single(outcome.Offers).OfferId);
        var warning = Assert.Single(outcome.Warnings);
        Assert.Contains("Hajee Air", warning);
    }

    [Fact]
    public async Task A_supplier_that_hangs_is_cut_off_at_the_deadline_while_the_other_still_returns()
    {
        var sabre = new FakeSupplier("SABRE") { Search = _ => Offers("SABRE-1") };
        var hajee = new FakeSupplier("HAJEE")
        {
            Search = async ct => { await Task.Delay(TimeSpan.FromSeconds(30), ct); return []; },
        };

        var started = DateTime.UtcNow;
        var outcome = await Composite(null, TimeSpan.FromMilliseconds(300), sabre, hajee).SearchWithWarningsAsync(Request, default);

        Assert.True(DateTime.UtcNow - started < TimeSpan.FromSeconds(5));
        Assert.Single(outcome.Offers);
        Assert.Single(outcome.Warnings);
    }

    [Fact]
    public async Task The_callers_own_cancellation_is_not_swallowed_as_a_supplier_failure()
    {
        using var cts = new CancellationTokenSource();
        var slow = new FakeSupplier("SABRE") { Search = async ct => { await Task.Delay(TimeSpan.FromSeconds(30), ct); return []; } };
        var task = Composite(null, null, slow).SearchWithWarningsAsync(Request, cts.Token);
        cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
    }

    [Fact]
    public async Task Calls_are_routed_to_the_supplier_that_owns_the_offer_id()
    {
        var sabre = new FakeSupplier("SABRE");
        var hajee = new FakeSupplier("HAJEE");
        var composite = Composite(null, null, sabre, hajee);

        await composite.RevalidateAsync("HAJEE-abc", 100, default);
        await composite.CreateBookingAsync(new B2BBookingRequest { OfferId = "SABRE-xyz" }, default);
        await composite.IssueTicketAsync("HAJEE", "REF1", 100, default);

        Assert.Equal(["revalidate:HAJEE-abc", "ticket:REF1"], hajee.Calls);
        Assert.Equal(["book:SABRE-xyz"], sabre.Calls);
    }

    [Fact]
    public async Task An_unknown_supplier_prefix_fails_cleanly_instead_of_throwing()
    {
        var composite = Composite(null, null, new FakeSupplier("SABRE"));

        var reval = await composite.RevalidateAsync("NOPE-1", 1, default);
        var booking = await composite.CreateBookingAsync(new B2BBookingRequest { OfferId = "NOPE-1" }, default);
        var ticket = await composite.IssueTicketAsync("NOPE", "R", 1, default);

        Assert.NotNull(reval.FailureReason);
        Assert.False(booking.Success);
        Assert.False(ticket.Success);
        Assert.Null(await composite.GetCachedNetRateAsync("NOPE-1", default));
    }

    [Fact]
    public async Task When_the_winning_offer_fails_to_reprice_the_other_suppliers_offer_is_offered_instead()
    {
        var hajee = new FakeSupplier("HAJEE") { Revalidate = (_, _) => new RevalidateResult(false, 0, "Offer expired") };
        var sabre = new FakeSupplier("SABRE") { Revalidate = (_, _) => new RevalidateResult(true, 3300, null, 250) };
        sabre.CachedNet["SABRE-1"] = 3300;
        var composite = Composite(new FakeAlternates(new() { ["HAJEE-1"] = ["SABRE-1"] }), null, sabre, hajee);

        var result = await composite.RevalidateAsync("HAJEE-1", 3000, default);

        Assert.False(result.Matches);
        Assert.Null(result.FailureReason);
        Assert.Equal("SABRE-1", result.ReplacementOfferId);
        Assert.Equal(3300, result.CurrentNetRate);
        Assert.Equal(250, result.CurrentTaxAmount);
    }

    [Fact]
    public async Task No_fallback_when_every_alternate_also_fails_or_none_exist()
    {
        var hajee = new FakeSupplier("HAJEE") { Revalidate = (_, _) => new RevalidateResult(false, 0, "Offer expired") };
        var sabre = new FakeSupplier("SABRE") { Revalidate = (_, _) => new RevalidateResult(false, 0, "gone too") };
        sabre.CachedNet["SABRE-1"] = 3300;

        var withAlt = await Composite(new FakeAlternates(new() { ["HAJEE-1"] = ["SABRE-1"] }), null, sabre, hajee).RevalidateAsync("HAJEE-1", 3000, default);
        var noAlt = await Composite(null, null, sabre, hajee).RevalidateAsync("HAJEE-1", 3000, default);

        Assert.Equal("Offer expired", withAlt.FailureReason);
        Assert.Null(withAlt.ReplacementOfferId);
        Assert.Equal("Offer expired", noAlt.FailureReason);
    }

    [Fact]
    public async Task A_price_change_without_failure_is_returned_as_is_with_no_fallback_attempt()
    {
        var hajee = new FakeSupplier("HAJEE") { Revalidate = (_, _) => new RevalidateResult(false, 3100, null, 100) };
        var sabre = new FakeSupplier("SABRE");
        var composite = Composite(new FakeAlternates(new() { ["HAJEE-1"] = ["SABRE-1"] }), null, sabre, hajee);

        var result = await composite.RevalidateAsync("HAJEE-1", 3000, default);

        Assert.Equal(3100, result.CurrentNetRate);
        Assert.Null(result.ReplacementOfferId);
        Assert.Empty(sabre.Calls);
    }
}
