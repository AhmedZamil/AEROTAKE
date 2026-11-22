using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Ota.CoreEngine.Grpc;
using Ota.CoreEngine.Suppliers;
using StackExchange.Redis;
using Xunit;

namespace Ota.CoreEngine.Tests.Unit;

/// <summary>
/// Drives the REAL HajeeAirProvider against a fake Hajee server that replays
/// the staging responses saved in apis-doc/samples. Offers are cached in the
/// shared dev Redis (unique keys, 20-minute TTL); the token service is faked
/// so the shared "hajee:access_token" key is never touched.
/// </summary>
public class HajeeAirProviderHttpTests : IAsyncLifetime
{
    private sealed record Seen(string Client, HttpMethod Method, string Path, string Body, string? Auth);

    private sealed class FakeFactory(Func<string, HttpMessageHandler> handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler(name)) { Timeout = TimeSpan.FromSeconds(10) };
    }

    private sealed class RoutingHandler(string client, List<Seen> seen, Func<HttpRequestMessage, string, string?, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            await Task.Yield(); // like a real network call, never answers on the caller's own stack (a blocking fake would serialise the calls it is meant to overlap)
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            var auth = request.Headers.Authorization?.Parameter;
            seen.Add(new Seen(client, request.Method, request.RequestUri!.AbsolutePath, body, auth));
            return respond(request, body, auth);
        }
    }

    private sealed class FakeTokens : IHajeeTokenService
    {
        private int _n = 1;
        public int Invalidations { get; private set; }
        public Task<string?> GetAccessTokenAsync(CancellationToken ct) => Task.FromResult<string?>($"tok{_n}");
        public Task InvalidateAsync() { Invalidations++; _n++; return Task.CompletedTask; }
    }

    private ConnectionMultiplexer _redis = default!;
    public async Task InitializeAsync() =>
        _redis = await ConnectionMultiplexer.ConnectAsync(Environment.GetEnvironmentVariable("OTA_TEST_REDIS_CONNECTION") ?? "localhost:6379,abortConnect=false");
    public async Task DisposeAsync() => await _redis.DisposeAsync();

    private static string Fixture(string file) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "hajee", file));
    private static HttpResponseMessage Json(HttpStatusCode code, string body) =>
        new(code) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private (HajeeAirProvider Provider, List<Seen> Seen, FakeTokens Tokens) Build(Func<HttpRequestMessage, string, string?, HttpResponseMessage> respond, string baseUrl = "https://fake.hajee.test")
    {
        var seen = new List<Seen>();
        var tokens = new FakeTokens();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["HAJEE_API_BASE_URL"] = baseUrl }).Build();
        var factory = new FakeFactory(name => new RoutingHandler(name, seen, respond));
        return (new HajeeAirProvider(factory, tokens, _redis, config, NullLogger<HajeeAirProvider>.Instance), seen, tokens);
    }

    private static readonly SearchRequest OneWay = new() { Origin = "DAC", Destination = "JED", CheckIn = "2026-10-25", Adults = 1, Children = 1 };

    private static HttpResponseMessage SearchOk(HttpRequestMessage r, string body, string? auth) => Json(HttpStatusCode.Created, Fixture("hajee-search-DAC-JED.trimmed.json"));

    [Fact]
    public async Task Search_maps_offers_sends_the_required_blocks_and_caches_what_reprice_and_hold_need()
    {
        var (provider, seen, _) = Build(SearchOk);

        var offers = await provider.SearchAsync(OneWay, default);

        Assert.Equal(6, offers.Count);
        Assert.All(offers, o => Assert.StartsWith("HAJEE-", o.OfferId));

        var call = Assert.Single(seen);
        Assert.Equal("hajee", call.Client);
        Assert.Equal("/api/v1/flight/flight-search", call.Path);
        Assert.Equal("tok1", call.Auth);
        var body = JsonNode.Parse(call.Body)!;
        Assert.Equal("BD", body["pointOfSale"]!.GetValue<string>());
        Assert.Equal("Oneway", body["searchCriteria"]!["tripType"]!.GetValue<string>());
        Assert.False(body["preferences"]!["nearbyAirports"]!.GetValue<bool>());
        Assert.NotNull(body["additionalInfo"]);            // 400 without it on real staging
        Assert.Equal(1, body["pagination"]!["page"]!.GetValue<int>());
        Assert.Equal(["ADT", "CHD"], body["passengerInfo"]!.AsArray().Select(p => p!["passengerType"]!.GetValue<string>()));
        Assert.Equal(["PAS1", "PAS2"], body["passengerInfo"]!.AsArray().Select(p => p!["passengerID"]!.GetValue<string>()));

        // Cached for reprice/hold: net + tax survive a round trip through Redis.
        var first = offers[0];
        Assert.Equal(first.NetRate, await provider.GetCachedNetRateAsync(first.OfferId, default));
        Assert.Equal(first.TaxAmount, await provider.GetCachedTaxAmountAsync(first.OfferId, default));
    }

    // ---- paging: pages 2+ are fetched together, and a page that fails or runs out of time never costs the pages already received

    private static HttpResponseMessage Page(string requestBody, int totalPages)
    {
        var page = JsonNode.Parse(requestBody)!["pagination"]!["page"]!.GetValue<int>();
        var doc = JsonNode.Parse(Fixture("hajee-search-DAC-JED.trimmed.json"))!;
        doc["payload"]!["pagination"]!["totalPages"] = totalPages;
        doc["payload"]!["pagination"]!["page"] = page;
        doc["payload"]!["searchId"] = $"sid-page-{page}";
        return Json(HttpStatusCode.Created, doc.ToJsonString());
    }

    private static int PageOf(string body) => JsonNode.Parse(body)!["pagination"]!["page"]!.GetValue<int>();

    [Fact]
    public async Task Later_pages_are_requested_at_the_same_time_not_one_after_another()
    {
        // Each of pages 2 and 3 answers only once BOTH have arrived: one after another, page 2 would wait for a page 3 that is never sent.
        var arrivals = 0;
        using var both = new ManualResetEventSlim(false);
        var (provider, seen, _) = Build((_, body, _) =>
        {
            if (PageOf(body) > 1)
            {
                if (Interlocked.Increment(ref arrivals) >= 2) both.Set();
                if (!both.Wait(TimeSpan.FromSeconds(5))) return Json(HttpStatusCode.RequestTimeout, "{}");
            }
            return Page(body, totalPages: 3);
        });

        var offers = await provider.SearchAsync(OneWay, default);

        Assert.Equal(18, offers.Count);                                            // 6 offers on each of the three pages
        Assert.Equal([1, 2, 3], seen.Select(x => PageOf(x.Body)).Order());
    }

    [Fact]
    public async Task A_page_that_fails_is_skipped_and_the_pages_that_arrived_are_kept()
    {
        var (provider, _, _) = Build((_, body, _) => PageOf(body) == 3 ? Json(HttpStatusCode.InternalServerError, """{"statusCode":500,"message":"Internal server error"}""") : Page(body, totalPages: 3));

        var offers = await provider.SearchAsync(OneWay, default);

        Assert.Equal(12, offers.Count);   // pages 1 and 2; not zero, and not an exception
    }

    [Fact]
    public async Task A_page_that_is_still_running_when_time_is_up_does_not_cost_the_pages_already_received()
    {
        using var cts = new CancellationTokenSource();
        var (provider, _, _) = Build((_, body, _) =>
        {
            if (PageOf(body) == 3) { cts.CancelAfter(50); Thread.Sleep(2000); throw new TaskCanceledException(); }   // stands in for a page that never comes back
            return Page(body, totalPages: 3);
        });

        var offers = await provider.SearchAsync(OneWay, cts.Token);

        Assert.Equal(12, offers.Count);
    }

    [Fact]
    public async Task The_first_page_failing_still_fails_the_whole_search()
    {
        var (provider, _, _) = Build((_, body, _) => PageOf(body) == 1 ? Json(HttpStatusCode.InternalServerError, "{}") : Page(body, totalPages: 3));

        await Assert.ThrowsAsync<InvalidOperationException>(() => provider.SearchAsync(OneWay, default));
    }

    [Fact]
    public async Task Round_trip_searches_are_skipped_without_calling_Hajee()
    {
        var (provider, seen, _) = Build(SearchOk);
        var offers = await provider.SearchAsync(new SearchRequest { Origin = "DAC", Destination = "JED", CheckIn = "2026-10-25", CheckOut = "2026-11-05", Adults = 1 }, default);
        Assert.Empty(offers);
        Assert.Empty(seen);
    }

    [Fact]
    public async Task A_rejected_first_page_throws_so_the_aggregator_can_warn()
    {
        var (provider, _, _) = Build((_, _, _) => Json(HttpStatusCode.Forbidden, """{"statusCode":403,"message":"Forbidden","error":{"message":"Forbidden resource"}}"""));
        await Assert.ThrowsAsync<InvalidOperationException>(() => provider.SearchAsync(OneWay, default));
    }

    [Fact]
    public async Task A_stale_token_is_refreshed_once_and_the_call_retried()
    {
        var (provider, seen, tokens) = Build((r, b, auth) => auth == "tok1"
            ? Json(HttpStatusCode.Unauthorized, """{"message":"Unauthorized","statusCode":401}""")
            : Json(HttpStatusCode.Created, Fixture("hajee-search-DAC-JED.trimmed.json")));

        var offers = await provider.SearchAsync(OneWay, default);

        Assert.Equal(6, offers.Count);
        Assert.Equal(1, tokens.Invalidations);
        Assert.Equal(["tok1", "tok2"], seen.Select(s => s.Auth));
    }

    [Fact]
    public async Task Https_is_required_because_passport_data_travels_over_this_API()
    {
        Assert.Null(HajeeConfig.BaseUrl(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["HAJEE_API_BASE_URL"] = "http://82.112.238.135:121" }).Build()));
        Assert.Equal("https://partnerapi.pp.hajeeair.com",
            HajeeConfig.BaseUrl(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["HAJEE_API_BASE_URL"] = "https://partnerapi.pp.hajeeair.com/" }).Build()));
        var (provider, _, _) = Build(SearchOk, baseUrl: "http://insecure.example");
        await Assert.ThrowsAsync<InvalidOperationException>(() => provider.SearchAsync(OneWay, default));
    }

    private async Task<(HajeeAirProvider Provider, List<Seen> Seen, SupplierOfferResult Offer)> SearchedFzOffer(Func<HttpRequestMessage, string, string?, HttpResponseMessage> extra)
    {
        var (provider, seen, _) = Build((r, b, a) => r.RequestUri!.AbsolutePath.EndsWith("flight-search") ? SearchOk(r, b, a) : extra(r, b, a));
        var offers = await provider.SearchAsync(OneWay, default);
        return (provider, seen, offers[2]); // the FZ offer the reprice fixture belongs to
    }

    [Fact]
    public async Task Reprice_with_an_unchanged_price_matches_and_uses_the_cached_search_and_offer_ids()
    {
        var (provider, seen, offer) = await SearchedFzOffer((_, _, _) => Json(HttpStatusCode.Created, Fixture("hajee-reprice.json")));

        var result = await provider.RevalidateAsync(offer.OfferId, offer.NetRate, default);

        Assert.True(result.Matches);
        Assert.Null(result.FailureReason);
        Assert.Equal(offer.NetRate, result.CurrentNetRate);
        var reprice = JsonNode.Parse(seen.Last().Body)!;
        Assert.Equal("DAC", reprice["sellCity"]!.GetValue<string>());
        Assert.False(string.IsNullOrEmpty(reprice["searchId"]!.GetValue<string>()));
        Assert.False(string.IsNullOrEmpty(reprice["offer"]![0]!["offerId"]!.GetValue<string>()));
        Assert.Equal(2, reprice["passengerInfo"]!.AsArray().Count);
    }

    [Fact]
    public async Task Reprice_reports_a_changed_price_and_the_new_net()
    {
        var changed = JsonNode.Parse(Fixture("hajee-reprice.json"))!;
        changed["payload"]![0]!["priceChanged"] = true;
        var (provider, _, offer) = await SearchedFzOffer((_, _, _) => Json(HttpStatusCode.Created, changed.ToJsonString()));

        var result = await provider.RevalidateAsync(offer.OfferId, offer.NetRate, default);

        Assert.False(result.Matches);
        Assert.Null(result.FailureReason);   // a price change, not a failure
    }

    [Fact]
    public async Task Reprice_of_an_unknown_or_rejected_offer_fails_cleanly()
    {
        var (provider, _, offer) = await SearchedFzOffer((_, _, _) => Json(HttpStatusCode.BadRequest, """{"statusCode":400,"error":{"message":["offer is no longer available"]}}"""));

        var rejected = await provider.RevalidateAsync(offer.OfferId, offer.NetRate, default);
        var unknown = await provider.RevalidateAsync("HAJEE-doesnotexist", 1, default);

        Assert.Contains("no longer available", rejected.FailureReason);
        Assert.Contains("expired", unknown.FailureReason);
    }

    private static B2BBookingRequest Booking(string offerId, string expiry = "2032-09-24") => new()
    {
        OfferId = offerId,
        ContactEmail = "agent@example.com",
        ContactPhone = "01700000000",
        Travelers =
        {
            new Traveler { FirstName = "John", LastName = "Doe", DateOfBirth = "1990-01-15", DocumentNumber = "A1234567", DocumentType = "PASSPORT",
                           Nationality = "BD", Title = "mr", Gender = "male", PassportExpiryDate = expiry, Wheelchair = true },
            new Traveler { FirstName = "Jane", LastName = "Doe", DateOfBirth = "2018-03-02", DocumentNumber = "B7654321", Gender = "female" },
        },
    };

    /// <summary>Makes the cached quote equal the hold fixture's userPayable (4144) so the price-drift guard passes.</summary>
    private async Task QuoteAt(SupplierOfferResult offer, decimal total)
    {
        var db = _redis.GetDatabase();
        var key = $"hajee:offer:{offer.OfferId}";
        var entry = JsonNode.Parse((await db.StringGetAsync(key)).ToString())!;
        entry["net"] = total - entry["tax"]!.GetValue<decimal>();
        await db.StringSetAsync(key, entry.ToJsonString(), TimeSpan.FromMinutes(5));
    }

    [Fact]
    public async Task Hold_booking_sends_the_documented_fields_on_the_non_retrying_client_and_returns_the_reference()
    {
        var (provider, seen, offer) = await SearchedFzOffer((_, _, _) => Json(HttpStatusCode.Created, Fixture("hajee-hold-booking.json")));

        await QuoteAt(offer, 4144m);
        var result = await provider.CreateBookingAsync(Booking(offer.OfferId), default);

        Assert.True(result.Success);
        Assert.Equal("GFF2609275", result.SupplierPnrId);   // HATBookingRef, verified on staging

        var hold = seen.Last();
        Assert.Equal("hajee-booking", hold.Client);   // never auto-retried
        Assert.Equal("/api/v1/flight/flight-hold-booking", hold.Path);
        var body = JsonNode.Parse(hold.Body)!;
        var adult = body["passengerInfo"]![0]!;
        Assert.Equal("ADT", adult["passengerType"]!.GetValue<string>());
        Assert.Equal("MR", adult["title"]!.GetValue<string>());
        Assert.Equal("A1234567", adult["passportNo"]!.GetValue<string>());
        Assert.Equal("BD", adult["nationality"]!.GetValue<string>());
        Assert.Equal("2032-09-24", adult["passportExpiryDate"]!.GetValue<string>());
        Assert.True(adult["isWheelChairNeeded"]!.GetValue<bool>());
        var child = body["passengerInfo"]![1]!;
        Assert.Equal("CHD", child["passengerType"]!.GetValue<string>());
        Assert.Equal("MS", child["title"]!.GetValue<string>());          // derived from gender
        Assert.Null(child["passportExpiryDate"]);                        // not collected => not sent
        Assert.Equal("+880", body["contactInfo"]!["phoneCode"]!.GetValue<string>());
        Assert.Equal("1700000000", body["contactInfo"]!["phoneNo"]!.GetValue<string>());
    }

    [Fact]
    public async Task A_hold_with_no_findable_reference_is_a_loud_failure_not_a_silent_success()
    {
        var (provider, _, offer) = await SearchedFzOffer((_, _, _) => Json(HttpStatusCode.Created, """{"statusCode":201,"payload":{"ok":true}}"""));
        var result = await provider.CreateBookingAsync(Booking(offer.OfferId), default);
        Assert.False(result.Success);
        Assert.Contains("no booking reference", result.FailureReason);
    }

    [Fact]
    public async Task A_transport_failure_during_hold_reports_an_unknown_outcome_instead_of_throwing()
    {
        var (provider, _, offer) = await SearchedFzOffer((_, _, _) => throw new HttpRequestException("connection reset"));
        var result = await provider.CreateBookingAsync(Booking(offer.OfferId), default);
        Assert.False(result.Success);
        Assert.Contains("may or may not have been created", result.FailureReason);
    }

    [Fact]
    public async Task Ticketing_reads_the_payable_from_the_PNR_and_pays_that_exact_amount_in_cash()
    {
        var (provider, seen, _) = Build((r, _, _) => r.Method == HttpMethod.Get
            ? Json(HttpStatusCode.OK, Fixture("hajee-retrieve-pnr.json"))
            : Json(HttpStatusCode.Created, """{"statusCode":201,"message":"ticket issued"}"""));

        var result = await provider.IssueTicketAsync("HAJEE", "HJ123456", 99999m /* our sell price: must NOT be what's paid */, default);

        Assert.True(result.Success);
        Assert.Equal(["hajee", "hajee-booking"], seen.Select(s => s.Client));
        Assert.Equal("/api/v1/flight/flight-retrieve-pnr/HJ123456", seen[0].Path);
        Assert.Equal(HttpMethod.Get, seen[0].Method);
        Assert.Equal("/api/v1/flight/flight-issue-ticket/HJ123456", seen[1].Path);
        var issue = JsonNode.Parse(seen[1].Body)!;
        Assert.Equal("CASH", issue["paymentMode"]!.GetValue<string>());
        Assert.Equal(4144m, decimal.Parse(issue["userPayable"]!.ToString()));   // the PNR's userPayable "4144.00", not our 99999 sell price
        Assert.Equal("BDT", issue["currency"]!.GetValue<string>());
    }

    [Fact]
    public async Task A_timeout_during_ticket_issue_is_an_unknown_outcome_not_a_refusal()
    {
        var (provider, seen, _) = Build((r, _, _) =>
        {
            if (r.Method == HttpMethod.Get)
                return Json(HttpStatusCode.OK, Fixture("hajee-retrieve-pnr.json"));
            throw new HttpRequestException("timed out");
        });

        var result = await provider.IssueTicketAsync("HAJEE", "HJ123456", 1m, default);

        Assert.False(result.Success);
        Assert.Equal(TicketIssueOutcome.Unknown, result.Outcome);
        Assert.Contains("may or may not have been issued", result.FailureReason);
        Assert.Equal("/api/v1/flight/flight-issue-ticket/HJ123456", seen[^1].Path);
    }

    [Fact]
    public async Task Ticketing_is_refused_when_the_PNR_has_no_payable_amount()
    {
        var (provider, seen, _) = Build((_, _, _) => Json(HttpStatusCode.OK, """{"payload":{"status":"HOLD"}}"""));
        var result = await provider.IssueTicketAsync("HAJEE", "HJ1", 1m, default);
        Assert.False(result.Success);
        Assert.Single(seen);   // never reached the issue endpoint
    }

    [Fact]
    public async Task HTTP_200_with_success_false_is_a_failure_with_Hajees_own_message()
    {
        // Real staging behavior for a BS flight with no inventory.
        var (provider, _, offer) = await SearchedFzOffer((_, _, _) => Json(HttpStatusCode.OK,
            """{"statusCode":200,"message":"Unknown Error","success":false,"error":{"message":"Price Not Available For this Selected Flight. Please Search Again."}}"""));

        var result = await provider.CreateBookingAsync(Booking(offer.OfferId), default);

        Assert.False(result.Success);
        Assert.Equal("Price Not Available For this Selected Flight. Please Search Again.", result.FailureReason);
    }

    [Fact]
    public async Task A_hold_priced_differently_from_what_we_sold_is_cancelled_and_rejected()
    {
        var (provider, seen, offer) = await SearchedFzOffer((r, _, _) => r.Method == HttpMethod.Post
            ? Json(HttpStatusCode.Created, Fixture("hajee-hold-booking.json"))                       // held at 4144
            : Json(HttpStatusCode.OK, """{"statusCode":200,"success":true,"message":"cancelled"}""")); // cancel
        await QuoteAt(offer, 3000m);   // we sold it at 3000

        var result = await provider.CreateBookingAsync(Booking(offer.OfferId), default);

        Assert.False(result.Success);
        Assert.Contains("fare changed", result.FailureReason);
        var cancel = seen.Last();
        Assert.Equal(HttpMethod.Get, cancel.Method);
        Assert.Equal("/api/v1/flight/flight-cancel-booking/GFF2609275", cancel.Path);
    }
}
