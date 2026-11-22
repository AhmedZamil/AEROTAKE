using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Ota.CoreEngine.Grpc;
using StackExchange.Redis;

namespace Ota.CoreEngine.Suppliers;

/// <summary>
/// Pure JSON -> domain mapping for Hajee Air's flight-search / reprice
/// payloads, kept separate from the HTTP plumbing so it can be unit-tested
/// against the real staging responses saved in apis-doc/samples.
/// </summary>
public static class HajeeOfferMapper
{
    public static decimal Num(JsonNode? n) => n switch
    {
        JsonValue v when v.TryGetValue<decimal>(out var d) => d,
        JsonValue v when v.TryGetValue<double>(out var x) => (decimal)x,
        _ => 0m,
    };

    /// <summary>
    /// Splits a Hajee fare into the two buckets PricingCalculator understands.
    /// Hajee's own accounting (verified against staging: 56552 - 3216 + 170 +
    /// 100 = 53606) is  userPayable = totalFare - commission + AIT + ticketing
    /// charge, and userPayable is what Hajee bills us at ticketing. So:
    ///   Tax = taxes + AIT + ticketing charge   (added un-marked-up, like Sabre)
    ///   Net = userPayable - Tax                (base fare after agent commission
    ///                                           — the part our markup applies to)
    /// Net + Tax always equals userPayable, whatever commission fields exist.
    /// </summary>
    public static (decimal Net, decimal Tax, string Currency)? ExtractPricing(JsonNode? flightOffer)
    {
        var price = flightOffer?["pricingInfo"]?["price"];
        if (price is null) return null;

        var tax = Num(price["taxes"]) + Num(price["ait"]) + Num(price["ticketingCharge"]);
        var userPayable = Num(price["userPayable"]);
        var net = userPayable - tax;
        if (userPayable <= 0 || net <= 0) return null;

        var currency = price["currency"]?.GetValue<string>() is { Length: > 0 } c ? c : "BDT";
        return (net, tax, currency);
    }

    /// <summary>
    /// Hajee gives local date/time per airport and NO timezone. The UI only
    /// needs durations/layovers from the UTC instants, so build a consistent
    /// chain: first departure is anchored at its local time (as UTC), each
    /// arrival = departure + the segment's flight duration, and each next
    /// departure = previous arrival + the local-time gap at the connection
    /// airport (same airport => same timezone => a true layover). Absolute
    /// values are therefore synthetic; only differences are meaningful.
    /// Dedupe across suppliers uses the *local* strings, never these.
    /// </summary>
    public static List<FlightSegmentResult> MapSegments(JsonNode? originDestinationOption, int legIndex)
    {
        var result = new List<FlightSegmentResult>();
        DateTimeOffset prevArrUtc = default;
        DateTime prevArrLocal = default;

        foreach (var seg in originDestinationOption?["segments"] as JsonArray ?? [])
        {
            if (seg is null) continue;
            var dep = seg["departure"];
            var arr = seg["arrival"];
            var info = seg["flightInfo"];

            var depLocalText = $"{dep?["scheduledDate"]?.GetValue<string>()}T{dep?["scheduledTime"]?.GetValue<string>()}";
            var arrLocalText = $"{arr?["scheduledDate"]?.GetValue<string>()}T{arr?["scheduledTime"]?.GetValue<string>()}";
            if (!DateTime.TryParse(depLocalText, CultureInfo.InvariantCulture, DateTimeStyles.None, out var depLocal)) continue;
            if (!DateTime.TryParse(arrLocalText, CultureInfo.InvariantCulture, DateTimeStyles.None, out var arrLocal)) continue;

            var durationMinutes = (double)Num(info?["duration"]);
            var depUtc = result.Count == 0
                ? new DateTimeOffset(DateTime.SpecifyKind(depLocal, DateTimeKind.Utc))
                : prevArrUtc + (depLocal - prevArrLocal);
            var arrUtc = depUtc + TimeSpan.FromMinutes(durationMinutes > 0 ? durationMinutes : Math.Max(0, (arrLocal - depLocal).TotalMinutes));

            result.Add(new FlightSegmentResult(
                AirlineCode: info?["marketingAirlineCode"]?.GetValue<string>() ?? "",
                FlightNumber: Num(info?["flightNumber"]).ToString("0", CultureInfo.InvariantCulture),
                Origin: dep?["airportCode"]?.GetValue<string>() ?? "",
                Destination: arr?["airportCode"]?.GetValue<string>() ?? "",
                DepartureTime: depUtc,
                ArrivalTime: arrUtc,
                BookingClass: info?["bookingCode"]?.GetValue<string>(),
                LegIndex: legIndex,
                DepartureTimeLocal: depLocal.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture),
                ArrivalTimeLocal: arrLocal.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture)));

            prevArrUtc = arrUtc;
            prevArrLocal = arrLocal;
        }

        return result;
    }

    /// <summary>First checked-bag allowance, if the offer reports one. Unit
    /// "KG" gives a weight; a piece-based allowance counts as "included" with
    /// weight 0 (same convention as the Sabre mapper).</summary>
    public static (bool Included, double WeightKg) ExtractBaggage(JsonNode? flightOffer)
    {
        var checkIn = flightOffer?["termsAndConditions"]?[0]?["baggageInformation"]?["checkIn"]?[0];
        if (checkIn is null) return (false, 0);
        var allowance = (double)Num(checkIn["allowance"]);
        if (allowance <= 0) return (false, 0);
        var unit = checkIn["unit"]?.GetValue<string>() ?? "";
        return (true, unit.Equals("KG", StringComparison.OrdinalIgnoreCase) ? allowance : 0);
    }

    /// <summary>Returns null when the itinerary can't be priced or has no usable segments.</summary>
    public static SupplierOfferResult? MapOffer(JsonNode? pricedItinerary, string ourOfferId)
    {
        var flightOffer = pricedItinerary?["flightOffer"];
        var pricing = ExtractPricing(flightOffer);
        if (pricing is null) return null;

        var options = flightOffer?["itinerary"]?["OriginDestinationOptions"] as JsonArray;
        if (options is null || options.Count == 0) return null;

        var segments = new List<FlightSegmentResult>();
        for (var i = 0; i < options.Count; i++) segments.AddRange(MapSegments(options[i], i));
        if (segments.Count == 0) return null;

        var carrier = flightOffer?["validatingCarrier"]?.GetValue<string>() ?? segments[0].AirlineCode;
        var baggage = ExtractBaggage(flightOffer);

        return new SupplierOfferResult(
            OfferId: ourOfferId,
            SupplierCode: "HAJEE",
            NetRate: pricing.Value.Net,
            Title: $"{segments[0].Origin} → {segments[^1].Destination} ({carrier})",
            Currency: pricing.Value.Currency,
            Segments: segments,
            CheckedBaggageIncluded: baggage.Included,
            CheckedBaggageWeightKg: baggage.WeightKg,
            TaxAmount: pricing.Value.Tax);
    }

    /// <summary>Reprice returns payload as an array (one item) whose
    /// pricedItineraries is a single object; tolerate both shapes.</summary>
    public static (JsonNode? FlightOffer, bool PriceChanged, string? SearchId) ParseReprice(JsonNode? payload)
    {
        var item = payload is JsonArray arr ? (arr.Count > 0 ? arr[0] : null) : payload;
        var priced = item?["pricedItineraries"];
        var flightOffer = priced is JsonArray list ? (list.Count > 0 ? list[0]?["flightOffer"] : null) : priced?["flightOffer"];
        var changed = item?["priceChanged"] is JsonValue v && v.TryGetValue<bool>(out var b) && b;
        return (flightOffer, changed, item?["searchId"]?.GetValue<string>());
    }
}

/// <summary>
/// Hajee Air (partner API) as an ISupplierProvider. Verified against the
/// staging environment for: token, search (one-way), reprice. Hold-booking,
/// PNR retrieve and issue-ticket follow the vendor PDF, whose docs have no
/// sample responses — their response parsing is deliberately defensive and
/// logs the raw body when it can't find what it needs (see FindString).
///
/// Round trips are NOT searched here: Hajee returns only the outbound side
/// for a "Return" search (the return sequence needs a separate request), so
/// round-trip searches stay Sabre-only for now.
/// </summary>
public sealed class HajeeAirProvider(
    IHttpClientFactory httpClientFactory,
    IHajeeTokenService tokens,
    IConnectionMultiplexer redis,
    IConfiguration config,
    ILogger<HajeeAirProvider> logger) : ISupplierProvider
{
    // Hajee sends about 13 KB per offer and, in pre-production, slowly. Smaller pages arrive (and are kept) one by one instead of one large
    // page that may not finish inside the time limit; the pages after the first are requested together.
    private const int MaxPages = 6;
    private const int PageSize = 20;
    private static readonly TimeSpan OfferCacheTtl = TimeSpan.FromMinutes(20);
    private static readonly string[] ReferenceKeys =
        ["HATBookingRef", "referenceNo", "referenceNumber", "bookingReference", "bookingRef", "reference"]; // HATBookingRef verified on staging

    public string SupplierCode => "HAJEE";
    public bool IsSlowSearch => true;

    private string BaseUrl => HajeeConfig.BaseUrl(config) ?? throw new InvalidOperationException("HAJEE_API_BASE_URL must be an https:// URL.");

    // ------------------------------ Search ---------------------------------

    public async Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(request.CheckOut))
        {
            logger.LogInformation("Hajee skipped for round-trip search {Origin}-{Destination}: only one-way is supported.", request.Origin, request.Destination);
            return [];
        }
        if (request.Adults + request.Children <= 0) return [];

        var results = new List<SupplierOfferResult>();
        var cache = redis.GetDatabase();
        var pending = new List<Task>();

        // Adds one page of Hajee's answer to the results (and remembers each offer so it can be repriced and held later).
        void AddPage(JsonNode payload)
        {
            var searchId = payload["searchId"]?.GetValue<string>() ?? "";
            foreach (var item in payload["pricedItineraries"] as JsonArray ?? [])
            {
                var ourId = $"HAJEE-{Guid.NewGuid():N}";
                var offer = HajeeOfferMapper.MapOffer(item, ourId);
                var theirOfferId = item?["flightOffer"]?["offerId"]?.GetValue<string>();
                if (offer is null || string.IsNullOrEmpty(theirOfferId) || searchId.Length == 0) continue;

                results.Add(offer);
                var entry = new JsonObject
                {
                    ["searchId"] = searchId,
                    ["offerId"] = theirOfferId,
                    ["sellCity"] = request.Origin,
                    ["adults"] = request.Adults,
                    ["children"] = request.Children,
                    ["infants"] = request.Infants,
                    ["net"] = offer.NetRate,
                    ["tax"] = offer.TaxAmount,
                    ["currency"] = offer.Currency,
                };
                pending.Add(cache.StringSetAsync($"hajee:offer:{ourId}", entry.ToJsonString(), OfferCacheTtl));
            }
        }

        // Page 1 decides whether there is anything more, and its failure fails the whole search.
        var (status, body, raw) = await CallAsync("hajee", HttpMethod.Post, "/api/v1/flight/flight-search", BuildSearchBody(request, 1), ct);
        if (!IsSuccess(status, body) || body?["payload"] is not JsonNode first)
        {
            logger.LogError("Hajee search failed: {Status} {Body}", status, Truncate(raw));
            throw new InvalidOperationException($"Hajee search failed with HTTP {status}.");
        }
        AddPage(first);

        // The remaining pages are independent requests, so they are fetched TOGETHER rather than one after another: Hajee's pre-production
        // answers take 5-14 s each, and three in a row overran the search deadline and threw away everything Hajee had found. A page that
        // fails or runs out of time is skipped; the pages that did arrive are kept.
        var totalPages = Math.Min(MaxPages, (int)HajeeOfferMapper.Num(first["pagination"]?["totalPages"]));
        if (totalPages > 1)
        {
            var more = await Task.WhenAll(Enumerable.Range(2, totalPages - 1).Select(async page =>
            {
                try
                {
                    var (st, bd, rw) = await CallAsync("hajee", HttpMethod.Post, "/api/v1/flight/flight-search", BuildSearchBody(request, page), ct);
                    if (IsSuccess(st, bd) && bd?["payload"] is JsonNode payload) return payload;
                    logger.LogWarning("Hajee search page {Page} failed: {Status} {Body}; keeping the pages already received.", page, st, Truncate(rw));
                }
                catch (Exception ex) when (ex is OperationCanceledException or HttpRequestException or TimeoutException)
                {
                    logger.LogWarning("Hajee search page {Page} did not arrive in time ({Reason}); keeping the pages already received.", page, ex.GetType().Name);
                }
                return null;
            }));
            foreach (var payload in more) if (payload is not null) AddPage(payload);
        }

        await Task.WhenAll(pending);
        return results;
    }

    private static JsonObject BuildSearchBody(SearchRequest request, int page) => new()
    {
        ["pointOfSale"] = "BD",
        ["searchCriteria"] = new JsonObject
        {
            ["tripType"] = "Oneway",
            ["originDestination"] = new JsonArray(new JsonObject
            {
                ["departure"] = new JsonObject { ["locationCode"] = request.Origin, ["date"] = request.CheckIn },
                ["arrival"] = new JsonObject { ["locationCode"] = request.Destination },
            }),
        },
        ["passengerInfo"] = BuildPassengerInfo(request.Adults, request.Children, request.Infants),
        ["preferences"] = new JsonObject
        {
            ["cabinClass"] = MapCabin(request.Filters.TryGetValue("cabin", out var cabin) ? cabin : null),
            ["maxStops"] = 4,
            ["carrierPreference"] = new JsonArray(),
            ["directFlightsOnly"] = false,
            ["nearbyAirports"] = false,
        },
        // Hajee prices in BDT; the documentation says the currency "should remain BDT".
        ["pricing"] = new JsonObject { ["currency"] = "BDT", ["isRefundableOnly"] = false, ["maxUpsells"] = 4 },
        ["responseOptions"] = new JsonObject
        {
            ["format"] = "JSON", ["version"] = "V4", ["includeUpsells"] = true,
            ["requestOptions"] = "TwoHundred", ["isMultiOneWayOffer"] = true, ["offerSequence"] = 1,
        },
        // additionalInfo and pagination are REQUIRED (400 without them),
        // even though the vendor's shorter examples omit them.
        ["additionalInfo"] = new JsonObject { ["conversationId"] = "ota-core-engine", ["target"] = "Test" },
        ["pagination"] = new JsonObject { ["limit"] = PageSize, ["page"] = page },
    };

    private static JsonArray BuildPassengerInfo(int adults, int children, int infants = 0)
    {
        var array = new JsonArray();
        var n = 1;
        for (var i = 0; i < adults; i++) array.Add(new JsonObject { ["passengerType"] = "ADT", ["passengerID"] = $"PAS{n++}" });
        for (var i = 0; i < children; i++) array.Add(new JsonObject { ["passengerType"] = "CHD", ["passengerID"] = $"PAS{n++}" });
        for (var i = 0; i < infants; i++) array.Add(new JsonObject { ["passengerType"] = "INF", ["passengerID"] = $"PAS{n++}" });
        return array;
    }

    private static string MapCabin(string? cabin) => (cabin ?? "").Replace("_", "").ToLowerInvariant() switch
    {
        "premiumeconomy" => "PremiumEconomy",
        "business" => "Business",
        "first" => "First",
        _ => "Economy",
    };

    // ------------------------------ Cache lookups ----------------------------

    private async Task<JsonNode?> GetCachedOfferAsync(string offerId, CancellationToken ct)
    {
        var cached = await redis.GetDatabase().StringGetAsync($"hajee:offer:{offerId}");
        return cached.HasValue ? JsonNode.Parse(cached!.ToString()) : null;
    }

    public async Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) =>
        (await GetCachedOfferAsync(offerId, ct))?["net"]?.GetValue<decimal>();

    public async Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) =>
        (await GetCachedOfferAsync(offerId, ct))?["tax"]?.GetValue<decimal>() ?? 0m;

    // ------------------------------ Reprice ----------------------------------

    public async Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct)
    {
        var cached = await GetCachedOfferAsync(offerId, ct);
        if (cached is null) return new RevalidateResult(false, 0, "Offer expired or unknown. Please search again.");

        var body = new JsonObject
        {
            ["sellCity"] = cached["sellCity"]!.GetValue<string>(),
            ["searchId"] = cached["searchId"]!.GetValue<string>(),
            ["offer"] = new JsonArray(new JsonObject { ["offerId"] = cached["offerId"]!.GetValue<string>() }),
            ["passengerInfo"] = BuildPassengerInfo(
                cached["adults"]!.GetValue<int>(),
                cached["children"]!.GetValue<int>(),
                cached["infants"]?.GetValue<int>() ?? 0),
            ["isCheckBookingClassPrice"] = false,
        };

        var (status, response, raw) = await CallAsync("hajee", HttpMethod.Post, "/api/v1/flight/flight-reprice", body, ct);
        if (!IsSuccess(status, response) || response?["payload"] is null)
        {
            logger.LogError("Hajee reprice failed: {Status} {Body}", status, Truncate(raw));
            return new RevalidateResult(false, 0, ExtractErrorMessage(response) ?? "Hajee reprice call failed.");
        }

        var (flightOffer, priceChanged, newSearchId) = HajeeOfferMapper.ParseReprice(response["payload"]);
        var pricing = HajeeOfferMapper.ExtractPricing(flightOffer);
        if (pricing is null) return new RevalidateResult(false, 0, "Hajee no longer offers this fare. Please search again.");

        // Keep the cache in step with what reprice just confirmed — hold
        // must use the freshest searchId/offerId and the price we quoted.
        cached["net"] = pricing.Value.Net;
        cached["tax"] = pricing.Value.Tax;
        if (newSearchId is { Length: > 0 }) cached["searchId"] = newSearchId;
        if (flightOffer?["offerId"]?.GetValue<string>() is { Length: > 0 } newOfferId) cached["offerId"] = newOfferId;
        await redis.GetDatabase().StringSetAsync($"hajee:offer:{offerId}", cached.ToJsonString(), OfferCacheTtl);

        return new RevalidateResult(!priceChanged && pricing.Value.Net == expectedNetRate, pricing.Value.Net, null, pricing.Value.Tax);
    }

    // ------------------------------ Hold booking -------------------------------

    public async Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct)
    {
        var cached = await GetCachedOfferAsync(request.OfferId, ct);
        if (cached is null) return new SupplierBookingResult(false, null, "Offer expired or unknown. Please search again.", "{}");

        var passengers = new JsonArray();
        for (var i = 0; i < request.Travelers.Count; i++)
        {
            var t = request.Travelers[i];
            var paxType = HajeePaxTypeFor(t.DateOfBirth);
            var pax = new JsonObject
            {
                ["passengerType"] = paxType,
                ["passengerID"] = $"PAS{i + 1}",
                ["firstName"] = t.FirstName,
                ["lastName"] = t.LastName,
                ["dateOfBirth"] = t.DateOfBirth,
                ["title"] = TitleFor(t, paxType),
                ["passportNo"] = t.DocumentNumber,
                ["nationality"] = t.Nationality is { Length: > 0 } n ? n : "BD",
                ["isWheelChairNeeded"] = t.Wheelchair,
                ["autoGenerate"] = false,
            };
            if (t.PassportExpiryDate is { Length: > 0 } expiry) pax["passportExpiryDate"] = expiry;
            passengers.Add(pax);
        }

        var body = new JsonObject
        {
            ["sellCity"] = cached["sellCity"]!.GetValue<string>(),
            ["searchId"] = cached["searchId"]!.GetValue<string>(),
            ["offer"] = new JsonArray(new JsonObject { ["offerId"] = cached["offerId"]!.GetValue<string>() }),
            ["passengerInfo"] = passengers,
            ["contactInfo"] = new JsonObject
            {
                ["phoneCode"] = "+880",
                ["phoneNo"] = LocalPhoneNumber(request.ContactPhone),
                ["email"] = request.ContactEmail,
                ["isSendEmail"] = false,
                ["isSendSms"] = false,
            },
            ["isCheckBookingClassPrice"] = false,
        };

        try
        {
            // "hajee-booking": never auto-retried — a timeout after Hajee
            // processed the hold must not create a second booking.
            var (status, response, raw) = await CallAsync("hajee-booking", HttpMethod.Post, "/api/v1/flight/flight-hold-booking", body, ct);
            if (!IsSuccess(status, response))
            {
                logger.LogError("Hajee hold booking failed: {Status} {Body}", status, Truncate(raw));
                return new SupplierBookingResult(false, null, ExtractErrorMessage(response) ?? "Hajee hold booking failed.", raw);
            }

            var reference = FindString(response, ReferenceKeys);
            if (reference is null)
            {
                // The hold most likely EXISTS at Hajee but we can't tell its
                // reference — log everything needed to recover it by hand.
                logger.LogError("Hajee hold returned {Status} but no booking reference was found. Raw response: {Body}", status, Truncate(raw));
                return new SupplierBookingResult(false, null, "Hajee accepted the hold but returned no booking reference. Please contact support before retrying.", raw);
            }

            // Hajee will bill THEIR userPayable at ticketing. If the hold came
            // back at a different amount than the fare we just sold (net + tax),
            // keeping it would silently eat the difference — release the hold
            // and make the agent search again instead.
            var quoted = cached["net"]!.GetValue<decimal>() + cached["tax"]!.GetValue<decimal>();
            var held = FindNumber(response, "userPayable");
            if (held is { } h && Math.Abs(h - quoted) > 0.5m)
            {
                logger.LogWarning("Hajee hold {Ref} came back at {Held} but we quoted {Quoted}; cancelling it.", reference, h, quoted);
                await CancelHoldAsync(SupplierCode, reference, ct);
                return new SupplierBookingResult(false, null, "The fare changed while booking. Please search again.", raw);
            }

            return new SupplierBookingResult(true, reference, null, raw);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or TimeoutException || ex.GetType().Name == "TimeoutRejectedException")
        {
            logger.LogError(ex, "Hajee hold booking outcome unknown (transport error after send).");
            return new SupplierBookingResult(false, null, "Hajee did not respond in time. The hold may or may not have been created — check with Hajee before retrying.", "{}");
        }
    }

    /// <summary>Best-effort release of a hold we must not keep. Verified on
    /// staging: cancel is a GET (the vendor PDF heading says POST).</summary>
    public async Task CancelHoldAsync(string supplierCode, string supplierPnrId, CancellationToken ct)
    {
        try
        {
            var (status, body, raw) = await CallAsync("hajee-booking", HttpMethod.Get,
                $"/api/v1/flight/flight-cancel-booking/{Uri.EscapeDataString(supplierPnrId)}", null, ct);
            if (!IsSuccess(status, body)) logger.LogError("Could not cancel Hajee hold {Ref}: {Status} {Body}", supplierPnrId, status, Truncate(raw));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not cancel Hajee hold {Ref} — cancel it manually.", supplierPnrId);
        }
    }

    // ------------------------------ Ticketing ----------------------------------

    public async Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct)
    {
        // Hajee bills us its own net (userPayable), not our sell price — read
        // it from the PNR itself, as the vendor documentation requires.
        var reference = Uri.EscapeDataString(supplierPnrId);
        var (rStatus, retrieved, rRaw) = await CallAsync("hajee", HttpMethod.Get, $"/api/v1/flight/flight-retrieve-pnr/{reference}", null, ct);
        if (!IsSuccess(rStatus, retrieved))
        {
            logger.LogError("Hajee PNR retrieve failed: {Status} {Body}", rStatus, Truncate(rRaw));
            return new TicketIssueResult(false, ExtractErrorMessage(retrieved) ?? "Could not retrieve the Hajee booking before ticketing.", rRaw);
        }

        var payable = FindNumber(retrieved, "userPayable");
        if (payable is null or <= 0)
        {
            logger.LogError("Hajee PNR retrieve had no userPayable. Raw response: {Body}", Truncate(rRaw));
            return new TicketIssueResult(false, "Hajee booking has no payable amount to ticket.", rRaw);
        }

        var body = new JsonObject { ["paymentMode"] = "CASH", ["userPayable"] = payable, ["currency"] = "BDT" };
        try
        {
            var (status, response, raw) = await CallAsync("hajee-booking", HttpMethod.Post, $"/api/v1/flight/flight-issue-ticket/{reference}", body, ct);
            if (!IsSuccess(status, response))
            {
                logger.LogError("Hajee ticket issue failed: {Status} {Body}", status, Truncate(raw));
                return new TicketIssueResult(false, ExtractErrorMessage(response) ?? "Hajee ticket issuance failed.", raw);
            }
            return new TicketIssueResult(true, null, raw);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or TimeoutException || ex.GetType().Name == "TimeoutRejectedException")
        {
            logger.LogError(ex, "Hajee ticket issue outcome unknown (transport error after send).");
            return new TicketIssueResult(false, "Hajee did not respond in time. The ticket may or may not have been issued — check with Hajee before retrying.", "{}")
            {
                Outcome = TicketIssueOutcome.Unknown,
            };
        }
    }

    // ------------------------------ HTTP plumbing ---------------------------------

    /// <summary>One authenticated call. A 401 means the (cached) token went
    /// stale — refresh once and retry, which is safe even for hold/issue since
    /// 401 means the request was rejected before being processed.</summary>
    private async Task<(int Status, JsonNode? Body, string Raw)> CallAsync(
        string clientName, HttpMethod method, string path, JsonNode? body, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            var token = await tokens.GetAccessTokenAsync(ct);
            if (token is null) return (0, null, "No Hajee access token available.");

            using var message = new HttpRequestMessage(method, $"{BaseUrl}{path}");
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            message.Headers.Accept.ParseAdd("*/*");
            if (body is not null) message.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

            var response = await httpClientFactory.CreateClient(clientName).SendAsync(message, ct);
            var raw = await response.Content.ReadAsStringAsync(ct);

            if ((int)response.StatusCode == 401 && attempt == 0)
            {
                await tokens.InvalidateAsync();
                continue;
            }

            JsonNode? parsed = null;
            try { parsed = JsonNode.Parse(raw); } catch (JsonException) { /* non-JSON error page */ }
            return ((int)response.StatusCode, parsed, raw);
        }
    }

    // ------------------------------ helpers -------------------------------------

    private static string HajeePaxTypeFor(string dateOfBirth)
    {
        var age = AgeInYears(dateOfBirth);
        if (age < 2) return "INF";
        if (age < 12) return "CHD";
        return "ADT";
    }

    private static int AgeInYears(string dateOfBirth)
    {
        if (!DateOnly.TryParseExact(dateOfBirth, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var dob))
            return 99;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = today.Year - dob.Year;
        if (dob > today.AddYears(-age)) age--;
        return age;
    }

    private static string TitleFor(Traveler t, string paxType = "ADT")
    {
        if (paxType == "INF")
            return t.Gender.Equals("female", StringComparison.OrdinalIgnoreCase) ? "MISS" : "MSTR";
        return t.Title.ToLowerInvariant() switch
        {
            "mr" => "MR",
            "mrs" => "MRS",
            "ms" => "MS",
            _ => t.Gender.Equals("female", StringComparison.OrdinalIgnoreCase) ? "MS" : "MR",
        };
    }

    /// <summary>The checkout form collects the local number (e.g. 1700000000);
    /// strip a leading 0 / 880 / +880 so it pairs cleanly with phoneCode +880.</summary>
    public static string LocalPhoneNumber(string phone)
    {
        var digits = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.StartsWith("880")) digits = digits[3..];
        return digits.TrimStart('0');
    }

    internal static string? ExtractErrorMessage(JsonNode? response)
    {
        var message = response?["error"]?["message"];
        if (message is JsonArray arr) return string.Join("; ", arr.Select(x => x?.ToString()).Where(x => !string.IsNullOrEmpty(x)));
        return message?.ToString() is { Length: > 0 } m ? m : response?["message"]?.ToString();
    }

    /// <summary>Breadth-first search for the first string value under any of
    /// the given (case-insensitive) property names.</summary>
    internal static string? FindString(JsonNode? root, string[] keys)
    {
        var queue = new Queue<JsonNode?>();
        queue.Enqueue(root);
        while (queue.Count > 0)
        {
            var node = queue.Dequeue();
            if (node is JsonObject obj)
            {
                foreach (var key in keys)
                    foreach (var (name, value) in obj)
                        if (name.Equals(key, StringComparison.OrdinalIgnoreCase) && value is JsonValue v && v.ToString() is { Length: > 0 } s)
                            return s;
                foreach (var (_, value) in obj) queue.Enqueue(value);
            }
            else if (node is JsonArray arr)
            {
                foreach (var item in arr) queue.Enqueue(item);
            }
        }
        return null;
    }

    internal static decimal? FindNumber(JsonNode? root, string key)
    {
        var text = FindString(root, [key]);
        return decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    /// <summary>Hajee reports many business failures as HTTP 200 with
    /// {"success":false,"error":{"message":…}} (e.g. a hold on a flight with no
    /// inventory: "Price Not Available For this Selected Flight"), so an HTTP
    /// status alone can't be trusted.</summary>
    internal static bool IsSuccess(int status, JsonNode? body) =>
        status is >= 200 and < 300 && !(body?["success"] is JsonValue v && v.TryGetValue<bool>(out var ok) && !ok);

    private static string Truncate(string s) => s.Length <= 3000 ? s : s[..3000] + "…";
}
