using System.Text.Json;
using System.Text.Json.Nodes;
using Ota.CoreEngine.Grpc;
using StackExchange.Redis;

namespace Ota.CoreEngine.Suppliers;

/// <summary>
/// Real Sabre GDS integration, ported from AeroTake's SabreProvider.php +
/// FlightSearchRequestService/FlightRevalidateRequestService/
/// CreatePassengerNameRecordRQ/AirTicketRequestService.php. Request bodies
/// are built as loose JsonObject trees (mirroring PHP's associative arrays)
/// rather than fully-typed DTOs — the Sabre schema is large, deeply nested,
/// and largely optional-field-driven, so a flexible tree is both more
/// faithful to the source and far less code to maintain than a parallel
/// class hierarchy for every nested Sabre message.
///
/// Architecture deviation from AeroTake (deliberate): Sabre's search
/// response has no reusable "offer_id" — AeroTake's browser round-trips the
/// full formatted itinerary JSON back to the server for revalidate/booking.
/// Here the raw itinerary context is cached server-side in Redis, keyed by
/// a short offer_id we mint, and re-read for revalidate/booking — consistent
/// with "never trust client-sent pricing," already the rule for
/// ProcessB2BBooking's net-rate lookup.
/// </summary>
public sealed class SabreProvider(
    IHttpClientFactory httpClientFactory,
    ISabreTokenService tokenService,
    IConnectionMultiplexer redis,
    IConfiguration config,
    ILogger<SabreProvider> logger)
    : ISupplierProvider
{
    private static readonly TimeSpan OfferCacheTtl = TimeSpan.FromMinutes(20);
    private static readonly string[] TicketGroupOrder = ["ADT", "Grp-C07", "Grp-C03", "INF"];
    private static readonly string[] C07Codes = ["C05", "C06", "C07", "C08", "C09", "C10", "C11"];
    private static readonly string[] C03Codes = ["C02", "C03", "C04"];

    private string BaseUrl => config["SABRE_API_BASE_URL"]?.TrimEnd('/') ?? "https://api.cert.platform.sabre.com";
    private string Pcc => config["SABRE_PCC"] ?? "";

    // ------------------------------ Search --------------------------------

    public string SupplierCode => "SABRE";

    public async Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["OTA_AirLowFareSearchRQ"] = new JsonObject
            {
                ["Version"] = "5",
                ["POS"] = new JsonObject
                {
                    ["Source"] = new JsonArray(new JsonObject
                    {
                        ["PseudoCityCode"] = Pcc,
                        ["RequestorID"] = new JsonObject
                        {
                            ["Type"] = "1",
                            ["ID"] = "1",
                            ["CompanyName"] = new JsonObject { ["Code"] = "TN" },
                        },
                    }),
                },
                ["OriginDestinationInformation"] = BuildOriginDestinationInformation(request),
                ["TravelPreferences"] = new JsonObject
                {
                    ["TPA_Extensions"] = new JsonObject
                    {
                        ["DataSources"] = new JsonObject { ["NDC"] = "Disable", ["ATPCO"] = "Enable", ["LCC"] = "Disable" },
                        ["PreferNDCSourceOnTie"] = new JsonObject { ["Value"] = true },
                    },
                },
                ["TravelerInfoSummary"] = new JsonObject
                {
                    ["AirTravelerAvail"] = new JsonArray(new JsonObject
                    {
                        ["PassengerTypeQuantity"] = BuildPassengerTypeQuantity(request.Adults, request.Children, request.Infants),
                    }),
                    ["PriceRequestInformation"] = new JsonObject
                    {
                        ["TPA_Extensions"] = new JsonObject
                        {
                            ["BrandedFareIndicators"] = new JsonObject { ["MultipleBrandedFares"] = true, ["ReturnBrandAncillaries"] = true },
                        },
                    },
                },
                ["TPA_Extensions"] = new JsonObject
                {
                    ["IntelliSellTransaction"] = new JsonObject { ["RequestType"] = new JsonObject { ["Name"] = "50ITINS" } },
                },
            },
        };

        var response = await PerformSabreRequestAsync("/v5/offers/shop", body, ct);
        // Throw (not "no results") so the aggregator can tell "Sabre is down"
        // from "no flights" and warn the agent the list may be incomplete.
        if (response is null) throw new InvalidOperationException("Sabre search call failed.");

        return await ExtractAndCacheOffersAsync(response, request, ct);
    }

    /// <summary>One entry for a one-way/multi-city (independently searched) leg;
    /// two — outbound then return, dates and endpoints swapped — when the caller
    /// set CheckOut, which turns this into a genuine combined-itinerary Sabre
    /// round-trip search rather than two separate one-way searches.</summary>
    private static JsonArray BuildOriginDestinationInformation(SearchRequest request)
    {
        var array = new JsonArray
        {
            new JsonObject
            {
                ["RPH"] = "1",
                ["DepartureDateTime"] = $"{request.CheckIn}T00:00:00",
                ["OriginLocation"] = new JsonObject { ["LocationCode"] = request.Origin },
                ["DestinationLocation"] = new JsonObject { ["LocationCode"] = request.Destination },
            },
        };

        if (!string.IsNullOrWhiteSpace(request.CheckOut))
        {
            array.Add(new JsonObject
            {
                ["RPH"] = "2",
                ["DepartureDateTime"] = $"{request.CheckOut}T00:00:00",
                ["OriginLocation"] = new JsonObject { ["LocationCode"] = request.Destination },
                ["DestinationLocation"] = new JsonObject { ["LocationCode"] = request.Origin },
            });
        }

        return array;
    }

    private static JsonArray BuildPassengerTypeQuantity(int adults, int children, int infants)
    {
        var array = new JsonArray();
        if (adults > 0)
            array.Add(new JsonObject { ["Quantity"] = adults, ["Code"] = "ADT", ["TPA_Extensions"] = new JsonObject { ["VoluntaryChanges"] = new JsonObject { ["Match"] = "Info" } } });
        if (children > 0)
            array.Add(new JsonObject { ["Quantity"] = children, ["Code"] = "C07", ["TPA_Extensions"] = new JsonObject { ["VoluntaryChanges"] = new JsonObject { ["Match"] = "Info" } } });
        if (infants > 0)
            array.Add(new JsonObject { ["Quantity"] = infants, ["Code"] = "INF", ["TPA_Extensions"] = new JsonObject { ["VoluntaryChanges"] = new JsonObject { ["Match"] = "Info" } } });
        return array;
    }

    private async Task<IReadOnlyList<SupplierOfferResult>> ExtractAndCacheOffersAsync(JsonNode response, SearchRequest request, CancellationToken ct)
    {
        var results = new List<SupplierOfferResult>();
        var r = response["groupedItineraryResponse"];
        if (r is null) return results;

        var scheduleDescsById = (r["scheduleDescs"] as JsonArray ?? [])
            .Where(s => s is not null)
            .ToDictionary(s => s!["id"]!.GetValue<int>(), s => s!);
        var legDescsById = (r["legDescs"] as JsonArray ?? [])
            .Where(l => l is not null)
            .ToDictionary(l => l!["id"]!.GetValue<int>(), l => l!);
        var baggageAllowanceById = (r["baggageAllowanceDescs"] as JsonArray ?? [])
            .Where(b => b is not null)
            .ToDictionary(b => b!["id"]!.GetValue<int>(), b => b!);

        var cache = redis.GetDatabase();
        var currency = request.Tenant?.Currency is { Length: > 0 } c ? c : "USD";

        foreach (var group in r["itineraryGroups"] as JsonArray ?? [])
        {
            if (group is null) continue;
            foreach (var itinerary in group["itineraries"] as JsonArray ?? [])
            {
                if (itinerary is null) continue;
                var pricing = itinerary["pricingInformation"]?.AsArray().FirstOrDefault();
                var totalFare = pricing?["fare"]?["totalFare"];
                if (totalFare is null) continue;

                // Base fare in its own currency (typically USD) is our "net
                // rate" — PricingCalculator applies OUR markup on top of it,
                // not Sabre's own currency-converted totalPrice. Tax is kept
                // separate (see totalTaxAmount below) and added back after
                // markup — see PricingCalculator's doc comment for why it's
                // not folded into netRate here.
                var netRate = BaseFareInSaleCurrency(totalFare);
                var taxAmount = totalFare["totalTaxAmount"]?.GetValue<decimal>() ?? 0m;
                var carrier = FirstCarrierCode(itinerary, legDescsById, scheduleDescsById);
                var segments = BuildSegmentResults(group, itinerary, legDescsById, scheduleDescsById, request.CheckIn, request.CheckOut);
                var (baggageIncluded, baggageWeightKg) = ResolveBaggageAllowance(itinerary, baggageAllowanceById);

                var offerId = $"SABRE-{Guid.NewGuid():N}";
                results.Add(new SupplierOfferResult(
                    offerId, "SABRE", netRate, $"{request.Origin} → {request.Destination} ({carrier})", SaleCurrency(totalFare, currency), segments,
                    baggageIncluded, baggageWeightKg, taxAmount));

                // Cache exactly what RevalidateAsync/CreateBookingAsync need to
                // rebuild Sabre's OriginDestinationInformation without a client
                // round-trip (RevalidateAsync overwrites this with its own
                // freshly-returned segment data once called — see there for why).
                // Tax rides along so ProcessB2BBooking's re-pricing matches what
                // search showed instead of silently dropping it at booking time.
                var cacheable = BuildCacheableOffer(group, itinerary, legDescsById, scheduleDescsById, request.Origin, request.Destination, request.CheckIn, request.CheckOut, netRate, taxAmount);
                await cache.StringSetAsync($"sabre:offer:{offerId}", cacheable.ToJsonString(), OfferCacheTtl);
            }
        }

        return results;
    }

    /// <summary>Shared by search and revalidate. Each cached schedule carries the
    /// calendar date Sabre assigned (leg departure date plus departureDateAdjustment)
    /// and the marriage group, so the hold sells the same flight the search showed.</summary>
    private static JsonObject BuildCacheableOffer(JsonNode group, JsonNode itinerary, Dictionary<int, JsonNode> legDescsById, Dictionary<int, JsonNode> scheduleDescsById, string origin, string destination, string checkIn, string? checkOut, decimal netRate, decimal taxAmount = 0m) => new()
    {
        ["scheduleDescs"] = DatedSchedules(group, itinerary, legDescsById, scheduleDescsById, checkIn, checkOut),
        ["bookingCodes"] = ExtractBookingCodes(itinerary),
        ["netRate"] = netRate,
        ["taxAmount"] = taxAmount,
        ["origin"] = origin,
        ["destination"] = destination,
        ["checkIn"] = checkIn,
    };

    private static string FirstCarrierCode(JsonNode itinerary, Dictionary<int, JsonNode> legDescsById, Dictionary<int, JsonNode> scheduleDescsById)
    {
        var legRef = itinerary["legs"]?.AsArray().FirstOrDefault()?["ref"]?.GetValue<int>();
        if (legRef is null || !legDescsById.TryGetValue(legRef.Value, out var leg)) return "SABRE";
        var schedRef = leg["schedules"]?.AsArray().FirstOrDefault()?["ref"]?.GetValue<int>();
        if (schedRef is null || !scheduleDescsById.TryGetValue(schedRef.Value, out var sched)) return "SABRE";
        return sched["carrier"]?["marketing"]?.GetValue<string>() ?? "SABRE";
    }

    /// <summary>Reads the itinerary's checked-baggage allowance (first
    /// passenger type's first entry — one uniform policy per itinerary is
    /// the overwhelmingly common case for these results). A literal "0 kg"
    /// entry (some basic-economy fares report one explicitly) reads as not
    /// included; a non-"kg" unit (piece-based allowances) is reported as
    /// included without a weight figure, rather than a wrong number in the
    /// wrong unit; no resolvable entry at all reads as "unknown," which
    /// callers treat the same as "not included."</summary>
    private static (bool Included, double WeightKg) ResolveBaggageAllowance(JsonNode itinerary, Dictionary<int, JsonNode> baggageAllowanceById)
    {
        var passengerInfo = itinerary["pricingInformation"]?.AsArray().FirstOrDefault()?["fare"]?["passengerInfoList"]?.AsArray().FirstOrDefault()?["passengerInfo"];
        var allowanceRef = passengerInfo?["baggageInformation"]?.AsArray().FirstOrDefault()?["allowance"]?["ref"]?.GetValue<int>();
        if (allowanceRef is null || !baggageAllowanceById.TryGetValue(allowanceRef.Value, out var allowance))
            return (false, 0);

        var unit = allowance["unit"]?.GetValue<string>();
        var isKg = string.Equals(unit, "kg", StringComparison.OrdinalIgnoreCase);
        var weight = isKg ? allowance["weight"]?.GetValue<double>() ?? 0 : 0;
        return (weight > 0 || !isKg, weight);
    }

    /// <summary>The flight details shown on the results list. Dates come from the
    /// same stamps the hold will send, so a connection that leaves the next day
    /// is not displayed as leaving today.</summary>
    private static IReadOnlyList<FlightSegmentResult> BuildSegmentResults(
        JsonNode group,
        JsonNode itinerary,
        Dictionary<int, JsonNode> legDescsById,
        Dictionary<int, JsonNode> scheduleDescsById,
        string checkIn,
        string? checkOut)
    {
        var dated = DatedSchedules(group, itinerary, legDescsById, scheduleDescsById, checkIn, checkOut);
        var bookingCodes = ExtractBookingCodes(itinerary);
        var segments = new List<FlightSegmentResult>(dated.Count);
        for (var i = 0; i < dated.Count; i++)
        {
            var sched = dated[i]!;
            var depRaw = sched["departure"]?["time"]?.GetValue<string>() ?? "00:00:00+00:00";
            var arrRaw = sched["arrival"]?["time"]?.GetValue<string>() ?? "00:00:00+00:00";
            var depDate = DateOnly.Parse(sched["departure"]!["date"]!.GetValue<string>());
            var arrDate = DateOnly.Parse(sched["arrival"]!["date"]!.GetValue<string>());
            var departure = ParseWithOffset(depDate, depRaw);
            var arrival = ParseWithOffset(arrDate, arrRaw);
            segments.Add(new FlightSegmentResult(
                AirlineCode: sched["carrier"]?["marketing"]?.GetValue<string>() ?? "",
                FlightNumber: sched["carrier"]?["marketingFlightNumber"]?.ToString() ?? "",
                Origin: sched["departure"]?["airport"]?.GetValue<string>() ?? "",
                Destination: sched["arrival"]?["airport"]?.GetValue<string>() ?? "",
                DepartureTime: departure,
                ArrivalTime: arrival,
                DepartureTimeLocal: departure.ToString("yyyy-MM-ddTHH:mm:ss"),
                ArrivalTimeLocal: arrival.ToString("yyyy-MM-ddTHH:mm:ss"),
                BookingClass: i < bookingCodes.Count ? bookingCodes[i]?.GetValue<string>() : null,
                LegIndex: ReadInt(sched["legIndex"])));
        }
        return segments;
    }

    /// <summary>Booking codes live under pricingInformation, not scheduleDescs —
    /// flattened across all fare components in segment order so they can be
    /// zipped positionally with the cached scheduleDescs array.</summary>
    private static JsonArray ExtractBookingCodes(JsonNode itinerary)
    {
        var array = new JsonArray();
        var passengerInfo = itinerary["pricingInformation"]?.AsArray().FirstOrDefault()?["fare"]?["passengerInfoList"]?.AsArray().FirstOrDefault()?["passengerInfo"];
        foreach (var component in passengerInfo?["fareComponents"] as JsonArray ?? [])
        {
            foreach (var seg in component?["segments"] as JsonArray ?? [])
            {
                var code = seg?["segment"]?["bookingCode"]?.GetValue<string>();
                array.Add(code is not null ? JsonValue.Create(code) : null);
            }
        }
        return array;
    }

    /// <summary>Clones each schedule Sabre returned and writes the calendar date
    /// and marriage group onto it. Sabre's schedule row has a clock time only.
    /// The date is the leg's departureDate plus that segment's departureDateAdjustment.
    /// A connection after the first segment is marriage group I, matching the
    /// request that creates a PNR.</summary>
    private static JsonArray DatedSchedules(
        JsonNode? group,
        JsonNode itinerary,
        Dictionary<int, JsonNode> legDescsById,
        Dictionary<int, JsonNode> scheduleDescsById,
        string checkIn,
        string? checkOut)
    {
        var breaks = ExtractAvailabilityBreaks(itinerary);
        var array = new JsonArray();
        var legs = itinerary["legs"]?.AsArray() ?? [];
        var flat = 0;
        for (var legIndex = 0; legIndex < legs.Count; legIndex++)
        {
            var legId = legs[legIndex]?["ref"]?.GetValue<int>();
            if (legId is null || !legDescsById.TryGetValue(legId.Value, out var leg)) continue;
            var legDate = LegDepartureDate(group, legIndex, checkIn, checkOut);
            var refs = leg["schedules"]?.AsArray() ?? [];
            for (var indexInLeg = 0; indexInLeg < refs.Count; indexInLeg++)
            {
                var schedRef = refs[indexInLeg];
                var schedId = schedRef?["ref"]?.GetValue<int>();
                if (schedId is null || !scheduleDescsById.TryGetValue(schedId.Value, out var sched)) continue;

                var depDate = legDate.AddDays(ReadInt(schedRef?["departureDateAdjustment"]));
                var arrAdjust = ReadInt(sched["arrival"]?["dateAdjustment"]);
                var arrDate = depDate.AddDays(arrAdjust);
                if (arrAdjust == 0 && ClockWraps(sched["departure"]?["time"], sched["arrival"]?["time"]))
                    arrDate = arrDate.AddDays(1);

                var clone = sched.DeepClone()!.AsObject();
                if (clone["departure"] is JsonObject dep) dep["date"] = depDate.ToString("yyyy-MM-dd");
                if (clone["arrival"] is JsonObject arr) arr["date"] = arrDate.ToString("yyyy-MM-dd");
                var availabilityBreak = flat < breaks.Count && breaks[flat];
                clone["marriageGrp"] = refs.Count <= 1 ? "O" : availabilityBreak || indexInLeg > 0 ? "I" : "O";
                clone["legIndex"] = legIndex;
                array.Add(clone);
                flat++;
            }
        }
        return array;
    }

    private static DateOnly LegDepartureDate(JsonNode? group, int legIndex, string checkIn, string? checkOut)
    {
        var raw = group?["groupDescription"]?["legDescriptions"]?.AsArray().ElementAtOrDefault(legIndex)?["departureDate"]?.GetValue<string>();
        if (DateOnly.TryParse(raw, out var parsed)) return parsed;
        if (legIndex > 0 && DateOnly.TryParse(checkOut, out var returning)) return returning;
        return DateOnly.Parse(checkIn);
    }

    private static List<bool> ExtractAvailabilityBreaks(JsonNode itinerary)
    {
        var list = new List<bool>();
        var passengerInfo = itinerary["pricingInformation"]?.AsArray().FirstOrDefault()?["fare"]?["passengerInfoList"]?.AsArray().FirstOrDefault()?["passengerInfo"];
        foreach (var component in passengerInfo?["fareComponents"] as JsonArray ?? [])
        {
            foreach (var seg in component?["segments"] as JsonArray ?? [])
                list.Add(seg?["segment"]?["availabilityBreak"] is JsonValue flag && flag.TryGetValue<bool>(out var broken) && broken);
        }
        return list;
    }

    private static int ReadInt(JsonNode? node)
    {
        if (node is JsonValue value && value.TryGetValue<int>(out var number)) return number;
        return node is not null && int.TryParse(node.ToString(), out var parsed) ? parsed : 0;
    }

    private static bool ClockWraps(JsonNode? departure, JsonNode? arrival)
    {
        var dep = TimeOnly.Parse(StripTimezone(departure) is { Length: > 0 } d ? d : "00:00:00");
        var arr = TimeOnly.Parse(StripTimezone(arrival) is { Length: > 0 } a ? a : "00:00:00");
        return arr <= dep;
    }

    // ------------------------------ Revalidate -----------------------------

    public async Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct)
    {
        var cached = await GetCachedOfferAsync(offerId, ct);
        return cached?["netRate"]?.GetValue<decimal>();
    }

    public async Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct)
    {
        var cached = await GetCachedOfferAsync(offerId, ct);
        // Older cache entries (written before tax was tracked) have no
        // "taxAmount" key at all — 0 there is "unknown," same as any other
        // supplier that doesn't report tax, not "confirmed zero tax."
        return cached?["taxAmount"]?.GetValue<decimal>() ?? 0m;
    }

    public async Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct)
    {
        var cached = await GetCachedOfferAsync(offerId, ct);
        if (cached is null) return new RevalidateResult(false, 0, "Offer expired or unknown. Please search again.");

        var scheduleDescs = cached["scheduleDescs"]!.AsArray();
        var bookingCodes = cached["bookingCodes"]!.AsArray();
        var checkIn = cached["checkIn"]!.GetValue<string>();

        var flights = BuildFlightSegments(scheduleDescs, bookingCodes, checkIn);
        var segmentDates = ResolveSegmentDateTimes(scheduleDescs, checkIn);
        var firstSched = scheduleDescs.FirstOrDefault();
        var lastSched = scheduleDescs.LastOrDefault();

        var body = new JsonObject
        {
            ["OTA_AirLowFareSearchRQ"] = new JsonObject
            {
                ["Version"] = "5",
                ["POS"] = new JsonObject { ["Source"] = new JsonArray(new JsonObject { ["PseudoCityCode"] = Pcc, ["RequestorID"] = new JsonObject { ["Type"] = "1", ["ID"] = "1", ["CompanyName"] = new JsonObject { ["Code"] = "TN" } } }) },
                ["OriginDestinationInformation"] = new JsonArray(new JsonObject
                {
                    ["RPH"] = "1",
                    ["DepartureDateTime"] = segmentDates.Length > 0 ? segmentDates[0].Departure : $"{checkIn}T00:00:00",
                    ["OriginLocation"] = new JsonObject { ["LocationCode"] = firstSched?["departure"]?["airport"]?.DeepClone() },
                    ["DestinationLocation"] = new JsonObject { ["LocationCode"] = lastSched?["arrival"]?["airport"]?.DeepClone() },
                    ["TPA_Extensions"] = new JsonObject { ["Flight"] = flights },
                }),
                ["TravelPreferences"] = new JsonObject
                {
                    ["TPA_Extensions"] = new JsonObject { ["VerificationItinCallLogic"] = new JsonObject { ["Value"] = "M", ["AlwaysCheckAvailability"] = true } },
                    ["Baggage"] = new JsonObject { ["RequestType"] = "A", ["Description"] = true },
                },
                ["TravelerInfoSummary"] = new JsonObject
                {
                    ["SeatsRequested"] = new JsonArray(1),
                    ["AirTravelerAvail"] = new JsonArray(new JsonObject { ["PassengerTypeQuantity"] = new JsonArray(new JsonObject { ["Quantity"] = 1, ["Code"] = "ADT", ["TPA_Extensions"] = new JsonObject { ["VoluntaryChanges"] = new JsonObject { ["Match"] = "Info" } } }) }),
                },
                ["TPA_Extensions"] = new JsonObject
                {
                    ["IntelliSellTransaction"] = new JsonObject { ["RequestType"] = new JsonObject { ["Name"] = "REVALIDATE" }, ["ServiceTag"] = new JsonObject { ["Name"] = "REVALIDATE" } },
                },
            },
        };

        var response = await PerformSabreRequestAsync("/v5/shop/flights/revalidate", body, ct);
        if (response is null) return new RevalidateResult(false, 0, "Sabre revalidate call failed.");

        var revalidatedGroup = response["groupedItineraryResponse"]?["itineraryGroups"]?.AsArray().FirstOrDefault();
        var revalidatedItinerary = revalidatedGroup?["itineraries"]?.AsArray().FirstOrDefault();

        // Best-effort re-extraction of the current price from the same
        // response shape search uses; if Sabre's revalidate payload nests it
        // differently we fall back to trusting the cached rate rather than
        // failing the whole flow on a parsing mismatch.
        var revalidatedTotalFare = revalidatedItinerary?["pricingInformation"]?.AsArray().FirstOrDefault()?["fare"]?["totalFare"];
        var currentRate = revalidatedTotalFare is null ? expectedNetRate : BaseFareInSaleCurrency(revalidatedTotalFare);
        // Falls back to the originally-cached tax (not 0) when revalidate's
        // payload doesn't parse — same "trust the cache over failing the
        // flow" fallback currentRate already uses for the net rate.
        var currentTaxAmount = revalidatedTotalFare?["totalTaxAmount"]?.GetValue<decimal>()
            ?? cached["taxAmount"]?.GetValue<decimal>() ?? 0m;

        // Re-cache using revalidate's own freshly-returned segment data, not
        // the original search response — a prior version of this method kept
        // booking against stale search-time data and Sabre's PNR-create
        // rejected it ("CHECK FLIGHT NUMBER") even though revalidate itself
        // confirmed the fare. Revalidate's response is the more authoritative,
        // just-reconfirmed source for what CreateBookingAsync should sell.
        if (revalidatedItinerary is not null)
        {
            var rGroup = response["groupedItineraryResponse"]!;
            var rScheduleDescsById = (rGroup["scheduleDescs"] as JsonArray ?? [])
                .Where(s => s is not null).ToDictionary(s => s!["id"]!.GetValue<int>(), s => s!);
            var rLegDescsById = (rGroup["legDescs"] as JsonArray ?? [])
                .Where(l => l is not null).ToDictionary(l => l!["id"]!.GetValue<int>(), l => l!);

            var refreshed = BuildCacheableOffer(revalidatedGroup!, revalidatedItinerary, rLegDescsById, rScheduleDescsById,
                cached["origin"]!.GetValue<string>(), cached["destination"]!.GetValue<string>(), cached["checkIn"]!.GetValue<string>(), null, currentRate, currentTaxAmount);
            await redis.GetDatabase().StringSetAsync($"sabre:offer:{offerId}", refreshed.ToJsonString(), OfferCacheTtl);
        }

        return new RevalidateResult(currentRate == expectedNetRate, currentRate, null, currentTaxAmount);
    }

    /// <summary>Sabre's scheduleDescs time fields carry a UTC-offset suffix
    /// (e.g. "11:10:00+06:00") that Sabre's own request schema doesn't want
    /// echoed back — strip it, matching AeroTake's regex.</summary>
    private static string StripTimezone(JsonNode? time)
    {
        var t = time?.GetValue<string>() ?? "";
        var tzIndex = t.IndexOfAny(['+', '-']);
        return tzIndex > 0 ? t[..tzIndex] : t;
    }

    /// <summary>Builds the TPA_Extensions.Flight array shared by revalidate and
    /// PNR-create — scheduleDescs and bookingCodes are parallel arrays (same
    /// segment order), zipped positionally since Sabre's raw response doesn't
    /// otherwise correlate them explicitly.</summary>
    private static JsonArray BuildFlightSegments(JsonArray scheduleDescs, JsonArray bookingCodes, string checkIn)
    {
        var dates = ResolveSegmentDateTimes(scheduleDescs, checkIn);
        var flights = new JsonArray();
        for (var i = 0; i < scheduleDescs.Count; i++)
        {
            var sched = scheduleDescs[i]!;
            var bookingCode = i < bookingCodes.Count ? bookingCodes[i]?.GetValue<string>() : null;
            flights.Add(new JsonObject
            {
                ["Airline"] = new JsonObject { ["Marketing"] = sched["carrier"]?["marketing"]?.DeepClone(), ["Operating"] = sched["carrier"]?["operating"]?.DeepClone() },
                ["Number"] = sched["carrier"]?["marketingFlightNumber"]?.DeepClone(),
                ["ClassOfService"] = bookingCode,
                ["OriginLocation"] = new JsonObject { ["LocationCode"] = sched["departure"]?["airport"]?.DeepClone() },
                ["DestinationLocation"] = new JsonObject { ["LocationCode"] = sched["arrival"]?["airport"]?.DeepClone() },
                ["DepartureDateTime"] = dates[i].Departure,
                ["ArrivalDateTime"] = dates[i].Arrival,
                ["Type"] = "A",
            });
        }
        return flights;
    }

    /// <summary>Departure and arrival as Sabre's create-PNR schema wants them:
    /// yyyy-MM-ddTHH:mm:ss with the offset stripped. Dated schedules already
    /// carry the calendar date. An older cache entry has no date, so that case
    /// still rolls an overnight arrival onto the next day from the search date.</summary>
    private static (string Departure, string Arrival)[] ResolveSegmentDateTimes(JsonArray scheduleDescs, string checkIn)
    {
        var results = new (string, string)[scheduleDescs.Count];
        var currentDate = DateOnly.Parse(checkIn);

        for (var i = 0; i < scheduleDescs.Count; i++)
        {
            var sched = scheduleDescs[i]!;
            var depTime = StripTimezone(sched["departure"]?["time"]);
            var arrTime = StripTimezone(sched["arrival"]?["time"]);
            if (string.IsNullOrEmpty(depTime)) depTime = "00:00:00";
            if (string.IsNullOrEmpty(arrTime)) arrTime = "00:00:00";

            if (sched["departure"]?["date"]?.GetValue<string>() is { Length: > 0 } depDate)
            {
                var arrDate = sched["arrival"]?["date"]?.GetValue<string>() is { Length: > 0 } stamped ? stamped : depDate;
                results[i] = ($"{depDate}T{depTime}", $"{arrDate}T{arrTime}");
                continue;
            }

            var departure = ParseWithOffset(currentDate, sched["departure"]?["time"]?.GetValue<string>() ?? "00:00:00+00:00");
            var arrival = ParseWithOffset(currentDate, sched["arrival"]?["time"]?.GetValue<string>() ?? "00:00:00+00:00");
            while (arrival <= departure) arrival = arrival.AddDays(1);
            results[i] = (departure.ToString("yyyy-MM-ddTHH:mm:ss"), arrival.ToString("yyyy-MM-ddTHH:mm:ss"));
            currentDate = DateOnly.FromDateTime(arrival.Date);
        }

        return results;
    }

    private static DateTimeOffset ParseWithOffset(DateOnly date, string timeWithOffset)
    {
        var tzIndex = timeWithOffset.IndexOfAny(['+', '-']);
        var timePart = tzIndex > 0 ? timeWithOffset[..tzIndex] : timeWithOffset;
        var offsetPart = tzIndex > 0 ? timeWithOffset[tzIndex..] : "+00:00";
        var offset = TimeSpan.Parse(offsetPart.StartsWith('+') ? offsetPart[1..] : offsetPart);
        return new DateTimeOffset(date.ToDateTime(TimeOnly.Parse(timePart)), offset);
    }

    private async Task<JsonNode?> GetCachedOfferAsync(string offerId, CancellationToken ct)
    {
        var cache = redis.GetDatabase();
        var cached = await cache.StringGetAsync($"sabre:offer:{offerId}");
        return cached.HasValue ? JsonNode.Parse((string)cached!) : null;
    }

    // ------------------------------ Booking (PNR create, no payment) -------

    public async Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct)
    {
        var cached = await GetCachedOfferAsync(request.OfferId, ct);
        if (cached is null) return new SupplierBookingResult(false, null, "Offer expired or unknown. Please search again.", "{}");

        var (nameNumbers, groupedPax) = AssignNameNumbers(request.Travelers);

        var personNames = new JsonArray();
        var advancePassenger = new JsonArray();
        var secureFlight = new JsonArray();
        var services = new JsonArray();

        for (var i = 0; i < request.Travelers.Count; i++)
        {
            var pax = request.Travelers[i];
            var nameNumber = nameNumbers[i];
            var isInfant = IsInfant(pax.DateOfBirth);
            var paxType = isInfant ? "INF" : InferChildOrAdultCode(pax.DateOfBirth);
            var genderCode = isInfant ? "MI" : "M"; // AeroTake reads gender from a form field we don't collect yet — see plan's TravelerValidation note.

            personNames.Add(new JsonObject
            {
                ["NameNumber"] = nameNumber,
                ["PassengerType"] = paxType,
                ["GivenName"] = pax.FirstName,
                ["Surname"] = pax.LastName,
                ["Infant"] = isInfant,
            });

            if (!string.IsNullOrWhiteSpace(pax.DocumentNumber))
            {
                advancePassenger.Add(new JsonObject
                {
                    ["Document"] = new JsonObject { ["Number"] = pax.DocumentNumber, ["ExpirationDate"] = pax.PassportExpiryDate is { Length: > 0 } exp ? exp : pax.DateOfBirth, ["Type"] = "P", ["IssueCountry"] = pax.Nationality is { Length: > 0 } n ? n : "BD", ["NationalityCountry"] = pax.Nationality is { Length: > 0 } n2 ? n2 : "BD" },
                    ["PersonName"] = new JsonObject { ["NameNumber"] = nameNumber, ["GivenName"] = pax.FirstName, ["Surname"] = pax.LastName, ["Gender"] = genderCode, ["DateOfBirth"] = pax.DateOfBirth },
                    ["SegmentNumber"] = "A",
                    ["VendorPrefs"] = new JsonObject { ["Airline"] = new JsonObject { ["Hosted"] = false } },
                });
            }

            secureFlight.Add(new JsonObject
            {
                ["PersonName"] = new JsonObject { ["NameNumber"] = nameNumber, ["GivenName"] = pax.FirstName, ["Surname"] = pax.LastName, ["DateOfBirth"] = pax.DateOfBirth, ["Gender"] = genderCode },
                ["SegmentNumber"] = "A",
                ["VendorPrefs"] = new JsonObject { ["Airline"] = new JsonObject { ["Hosted"] = false } },
            });

            if (nameNumber == "1.1")
            {
                services.Add(new JsonObject { ["SegmentNumber"] = "A", ["SSR_Code"] = "OTHS", ["PersonName"] = new JsonObject { ["NameNumber"] = nameNumber }, ["Text"] = $"CC {pax.LastName} {pax.FirstName}" });
                services.Add(new JsonObject { ["SegmentNumber"] = "A", ["SSR_Code"] = "CTCM", ["PersonName"] = new JsonObject { ["NameNumber"] = nameNumber }, ["Text"] = request.ContactPhone });
                services.Add(new JsonObject { ["SegmentNumber"] = "A", ["SSR_Code"] = "CTCE", ["PersonName"] = new JsonObject { ["NameNumber"] = nameNumber }, ["Text"] = request.ContactEmail.Replace("@", "//") });
            }
        }

        var scheduleDescs = cached["scheduleDescs"]!.AsArray();
        var bookingCodes = cached["bookingCodes"]!.AsArray();
        var checkIn = cached["checkIn"]!.GetValue<string>();
        var segmentDates = ResolveSegmentDateTimes(scheduleDescs, checkIn);
        var flightSegments = new JsonArray();
        var numberInParty = request.Travelers.Count(t => !IsInfant(t.DateOfBirth));
        for (var i = 0; i < scheduleDescs.Count; i++)
        {
            var sched = scheduleDescs[i]!;
            var bookingCode = i < bookingCodes.Count ? bookingCodes[i]?.GetValue<string>() : null;
            flightSegments.Add(new JsonObject
            {
                ["DepartureDateTime"] = segmentDates[i].Departure,
                ["FlightNumber"] = sched["carrier"]?["marketingFlightNumber"]?.ToString(),
                ["Status"] = "NN",
                ["ResBookDesigCode"] = bookingCode,
                ["NumberInParty"] = numberInParty.ToString(),
                ["DestinationLocation"] = new JsonObject { ["LocationCode"] = sched["arrival"]?["airport"]?.DeepClone() },
                ["MarketingAirline"] = new JsonObject { ["FlightNumber"] = sched["carrier"]?["marketingFlightNumber"]?.ToString(), ["Code"] = sched["carrier"]?["marketing"]?.DeepClone() },
                ["MarriageGrp"] = sched["marriageGrp"]?.GetValue<string>() is { Length: > 0 } marriage ? marriage : "O",
                ["OriginLocation"] = new JsonObject { ["LocationCode"] = sched["departure"]?["airport"]?.DeepClone() },
            });
        }

        var body = new JsonObject
        {
            ["CreatePassengerNameRecordRQ"] = new JsonObject
            {
                ["version"] = "2.5.0",
                ["targetCity"] = Pcc,
                ["haltOnAirPriceError"] = true,
                ["TravelItineraryAddInfo"] = new JsonObject
                {
                    // Agency address: AeroTake falls back to these exact
                    // placeholders when the requesting user has no
                    // city/state/country on file — our User entity doesn't
                    // collect that yet (out of this plan's scope), so we
                    // always take AeroTake's own fallback path here.
                    ["AgencyInfo"] = new JsonObject
                    {
                        ["Address"] = new JsonObject { ["AddressLine"] = "NA", ["CityName"] = "NA", ["CountryCode"] = "NA", ["PostalCode"] = "1212", ["StateCountyProv"] = new JsonObject { ["StateCode"] = "NA" }, ["StreetNmbr"] = "DHAKA" },
                        ["Ticketing"] = new JsonObject { ["TicketType"] = "7TAW" },
                    },
                    ["CustomerInfo"] = new JsonObject
                    {
                        ["ContactNumbers"] = new JsonObject { ["ContactNumber"] = new JsonArray(new JsonObject { ["NameNumber"] = "1.1", ["Phone"] = request.ContactPhone, ["PhoneUseType"] = "M" }) },
                        ["Email"] = new JsonArray(new JsonObject { ["NameNumber"] = "1.1", ["Address"] = request.ContactEmail }),
                        ["PersonName"] = personNames,
                    },
                },
                ["AirBook"] = new JsonObject
                {
                    ["OriginDestinationInformation"] = new JsonObject { ["FlightSegment"] = flightSegments },
                    ["HaltOnStatus"] = BuildHaltOnStatusCodes(),
                    ["RedisplayReservation"] = new JsonObject { ["NumAttempts"] = 3, ["WaitInterval"] = 3000 },
                },
                ["AirPrice"] = new JsonArray(new JsonObject
                {
                    ["PriceRequestInformation"] = new JsonObject
                    {
                        ["Retain"] = true,
                        ["OptionalQualifiers"] = new JsonObject
                        {
                            ["PricingQualifiers"] = new JsonObject { ["PassengerType"] = groupedPax },
                            ["FOP_Qualifiers"] = new JsonObject { ["BasicFOP"] = new JsonObject { ["Type"] = "CASH" } },
                        },
                    },
                }),
                ["SpecialReqDetails"] = new JsonObject
                {
                    ["SpecialService"] = new JsonObject { ["SpecialServiceInfo"] = new JsonObject { ["AdvancePassenger"] = advancePassenger, ["SecureFlight"] = secureFlight, ["Service"] = services } },
                    ["AddRemark"] = new JsonObject
                    {
                        ["RemarkInfo"] = new JsonObject
                        {
                            ["Remark"] = new JsonArray(
                                MakeRemark("THE FARE IS NOT GUARANTEED UNTIL THE TICKET HAS BEEN ISSUED."),
                                MakeRemark("YOUR TICKET IS NOT FULLY REFUNDABLE."),
                                MakeRemark("PLEASE REPORT TO THE AIRPORT 4 HOURS PRIOR TO EACH DEPARTURE FLIGHT")),
                        },
                    },
                },
                ["PostProcessing"] = new JsonObject
                {
                    ["EndTransaction"] = new JsonObject { ["Source"] = new JsonObject { ["ReceivedFrom"] = "web" } },
                    ["RedisplayReservation"] = new JsonObject { ["waitInterval"] = 800 },
                    ["WaitForAirlineRecLoc"] = new JsonObject { ["waitInterval"] = 8000, ["numAttempts"] = 6 },
                },
            },
        };

        var response = await PerformSabreRequestAsync("/v2.5.0/passenger/records?mode=create", body, ct, "sabre-booking");
        var raw = response?.ToJsonString() ?? "{}";
        if (response is null) return new SupplierBookingResult(false, null, "Sabre PNR creation call failed.", raw);

        var status = response["CreatePassengerNameRecordRS"]?["ApplicationResults"]?["status"]?.GetValue<string>()
            ?? response["ApplicationResults"]?["status"]?.GetValue<string>();
        if (status != "Complete")
        {
            logger.LogError("Sabre PNR create did not complete: {Response}\nRequest was: {Request}", Truncate(raw), Truncate(body.ToJsonString()));
            return new SupplierBookingResult(false, null, ExtractErrorMessages(response), raw);
        }

        var pnrId = response["CreatePassengerNameRecordRS"]?["ItineraryRef"]?["ID"]?.GetValue<string>()
            ?? response["ItineraryRef"]?["ID"]?.GetValue<string>();
        if (pnrId is null) return new SupplierBookingResult(false, null, "Sabre response missing ItineraryRef.ID.", raw);

        // Ticketing needs the same NameNumber-per-passenger-group mapping —
        // cache it keyed by the PNR so IssueTicketAsync can rebuild PriceQuote.
        var cache = redis.GetDatabase();
        var groupAssignments = new JsonObject();
        for (var i = 0; i < request.Travelers.Count; i++)
            groupAssignments[nameNumbers[i]] = GroupFor(request.Travelers[i].DateOfBirth);
        await cache.StringSetAsync($"sabre:pnr-groups:{pnrId}", groupAssignments.ToJsonString(), TimeSpan.FromDays(1));

        return new SupplierBookingResult(true, pnrId, null, raw);
    }

    private static JsonObject MakeRemark(string text) => new() { ["Text"] = text, ["Code"] = "H", ["Type"] = "Itinerary" };

    private static JsonArray BuildHaltOnStatusCodes()
    {
        var array = new JsonArray();
        foreach (var code in new[] { "NO", "NN", "UC", "US", "UN", "LL", "HL", "HX", "WL" })
            array.Add(new JsonObject { ["Code"] = code });
        return array;
    }

    private static (List<string> NameNumbers, JsonArray GroupedPax) AssignNameNumbers(Google.Protobuf.Collections.RepeatedField<Traveler> travelers)
    {
        // ADT=group1, Grp-C07=group2, Grp-C03=group3, INF=group4 — same
        // convention as AeroTake's ticketIssueConfirm typeGroups, so ticket
        // issuance (a separate later call) reconstructs identical numbers.
        var groupCounters = new Dictionary<string, int>();
        var nameNumbers = new List<string>();
        var quantities = new Dictionary<string, int>();

        foreach (var t in travelers)
        {
            var group = GroupFor(t.DateOfBirth);
            var groupNumber = group switch { "ADT" => 1, "Grp-C07" => 2, "Grp-C03" => 3, _ => 4 };
            groupCounters.TryGetValue(group, out var count);
            count++;
            groupCounters[group] = count;
            nameNumbers.Add($"{groupNumber}.{count}");
            quantities[SabreCodeFor(group)] = quantities.GetValueOrDefault(SabreCodeFor(group)) + 1;
        }

        var grouped = new JsonArray();
        foreach (var (code, qty) in quantities)
            grouped.Add(new JsonObject { ["Code"] = code, ["Quantity"] = qty.ToString() });

        return (nameNumbers, grouped);
    }

    private static string SabreCodeFor(string group) => group switch { "ADT" => "ADT", "Grp-C07" => "C07", "Grp-C03" => "C03", _ => "INF" };

    private static string GroupFor(string dateOfBirth)
    {
        if (IsInfant(dateOfBirth)) return "INF";
        var years = AgeInYears(dateOfBirth);
        if (years < 5) return "Grp-C03";
        if (years < 12) return "Grp-C07";
        return "ADT";
    }

    private static string InferChildOrAdultCode(string dateOfBirth)
    {
        var years = AgeInYears(dateOfBirth);
        if (years < 5) return "C03";
        if (years < 12) return "C07";
        return "ADT";
    }

    private static bool IsInfant(string dateOfBirth) => AgeInYears(dateOfBirth) < 2;

    private static double AgeInYears(string dateOfBirth) =>
        DateTime.TryParse(dateOfBirth, out var dob) ? (DateTime.UtcNow - dob).TotalDays / 365.25 : 30; // unparsable -> treat as adult, never silently drops a traveler

    // ------------------------------ Ticket issuance (payment) --------------

    public async Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct)
    {
        var cache = redis.GetDatabase();
        var groupsJson = await cache.StringGetAsync($"sabre:pnr-groups:{supplierPnrId}");
        if (!groupsJson.HasValue)
            return new TicketIssueResult(false, "No cached passenger-group data for this PNR (cache expired or booking wasn't created through this service).", "{}");

        var groups = JsonNode.Parse((string)groupsJson!)!.AsObject();
        var byGroupNumber = new Dictionary<int, List<string>>();
        foreach (var (nameNumber, groupNode) in groups)
        {
            var groupNumber = groupNode!.GetValue<string>() switch { "ADT" => 1, "Grp-C07" => 2, "Grp-C03" => 3, _ => 4 };
            byGroupNumber.TryAdd(groupNumber, []);
            byGroupNumber[groupNumber].Add(nameNumber);
        }

        var priceQuote = new JsonArray();
        foreach (var (number, nameNumbers) in byGroupNumber.OrderBy(kv => kv.Key))
        {
            var nameSelect = new JsonArray();
            foreach (var n in nameNumbers) nameSelect.Add(new JsonObject { ["NameNumber"] = double.Parse(n) });

            priceQuote.Add(new JsonObject
            {
                ["NameSelect"] = nameSelect,
                ["Record"] = new JsonArray(new JsonObject { ["Number"] = number, ["Reissue"] = false }),
            });
        }

        var body = new JsonObject
        {
            ["AirTicketRQ"] = new JsonObject
            {
                ["version"] = "1.3.0",
                ["targetCity"] = Pcc,
                ["DesignatePrinter"] = new JsonObject
                {
                    ["Printers"] = new JsonObject { ["Ticket"] = new JsonObject { ["CountryCode"] = "BD" }, ["Hardcopy"] = new JsonObject { ["LNIATA"] = "BBA25D" }, ["InvoiceItinerary"] = new JsonObject { ["LNIATA"] = "BBA25D" } },
                },
                ["Itinerary"] = new JsonObject { ["ID"] = supplierPnrId },
                ["Ticketing"] = new JsonArray(new JsonObject
                {
                    ["FOP_Qualifiers"] = new JsonObject { ["BasicFOP"] = new JsonObject { ["Type"] = "CA" } },
                    ["MiscQualifiers"] = new JsonObject { ["Commission"] = new JsonObject { ["Percent"] = 7 } },
                    ["PricingQualifiers"] = new JsonObject { ["PriceQuote"] = priceQuote },
                }),
                ["PostProcessing"] = new JsonObject { ["EndTransaction"] = new JsonObject { ["Source"] = new JsonObject { ["ReceivedFrom"] = "SABRE WEB" } } },
            },
        };

        var response = await PerformSabreRequestAsync("/v1.3.0/air/ticket", body, ct, "sabre-booking");
        var raw = response?.ToJsonString() ?? "{}";
        // No response body: the call may have been received. Do not treat that as a refusal.
        if (response is null) return new TicketIssueResult(false, "Sabre ticket issuance call failed.", raw) { Outcome = TicketIssueOutcome.Unknown };

        var status = response["AirTicketRS"]?["ApplicationResults"]?["status"]?.GetValue<string>()
            ?? response["ApplicationResults"]?["status"]?.GetValue<string>();

        if (status != "Complete")
            logger.LogError("Sabre ticket issuance did not complete: {Response}\nRequest was: {Request}", Truncate(raw), Truncate(body.ToJsonString()));

        return status == "Complete"
            ? new TicketIssueResult(true, null, raw)
            : new TicketIssueResult(false, ExtractErrorMessages(response), raw);
    }

    private static string ExtractErrorMessages(JsonNode response)
    {
        var errors = response.AsObject().Select(kv => kv.Value).OfType<JsonObject>()
            .SelectMany(root => (root["ApplicationResults"]?["Error"] as JsonArray) ?? [])
            .SelectMany(err => (err?["SystemSpecificResults"] as JsonArray) ?? [])
            .SelectMany(res => (res?["Message"] as JsonArray) ?? [])
            .Select(m => m?["content"]?.GetValue<string>())
            .Where(m => m is not null);
        var joined = string.Join("; ", errors);
        return string.IsNullOrEmpty(joined) ? "Sabre request did not complete." : joined;
    }

    // ------------------------------ HTTP plumbing ---------------------------

    /// <summary>clientName picks the resilience profile — "sabre" (default)
    /// retries transient failures since search/revalidate are read-only, while
    /// "sabre-booking" (PNR create/ticket issue) never retries automatically
    /// since those calls aren't idempotent. See GdsResilienceExtensions.</summary>
    private async Task<JsonNode?> PerformSabreRequestAsync(string path, JsonObject body, CancellationToken ct, string clientName = "sabre")
    {
        var token = await tokenService.GetAccessTokenAsync(ct);
        if (token is null)
        {
            logger.LogError("Cannot call Sabre {Path} — no access token available.", path);
            return null;
        }

        var client = httpClientFactory.CreateClient(clientName);
        using var requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}{path}")
        {
            Content = new StringContent(body.ToJsonString(), System.Text.Encoding.UTF8, "application/json"),
        };
        requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        requestMessage.Headers.Add("Conversation-ID", "ota-core-engine");

        var response = await client.SendAsync(requestMessage, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("Sabre call to {Path} failed: {Status} {Body}\nRequest was: {Request}", path, response.StatusCode, Truncate(responseBody), Truncate(body.ToJsonString()));
            return null;
        }

        try
        {
            return JsonNode.Parse(responseBody);
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "Sabre response from {Path} was not valid JSON: {Body}", path, Truncate(responseBody));
            return null;
        }
    }

    /// <summary>
    /// Base fare in the SAME currency as totalTaxAmount/totalPrice (the point-
    /// of-sale currency). For domestic fares baseFareAmount already is that,
    /// but international fares are constructed in another currency (e.g.
    /// baseFareAmount 360 USD vs equivalentAmount 44,514 BDT) — reading
    /// baseFareAmount there mixed USD with BDT taxes and produced fares ~5x
    /// too low. equivalentAmount is the converted figure when Sabre supplies one.
    /// </summary>
    public static decimal BaseFareInSaleCurrency(JsonNode totalFare)
    {
        var equivalent = totalFare["equivalentAmount"]?.GetValue<decimal>();
        if (equivalent is > 0) return equivalent.Value;
        return totalFare["baseFareAmount"]?.GetValue<decimal>() ?? 0m;
    }

    /// <summary>The currency Sabre actually priced the fare in (the point-of-sale currency — the same one totalPrice, the taxes and
    /// equivalentAmount are in). The request's currency label is only a fallback for a response that does not say: labelling BDT amounts
    /// "USD" made the storefront show a 76,000-unit fare in dollars.</summary>
    public static string SaleCurrency(JsonNode totalFare, string fallback) =>
        totalFare["currency"]?.GetValue<string>() is { Length: 3 } c ? c.ToUpperInvariant() : fallback;

    private static string Truncate(string s) => s.Length <= 3000 ? s : s[..3000] + "…";
}
