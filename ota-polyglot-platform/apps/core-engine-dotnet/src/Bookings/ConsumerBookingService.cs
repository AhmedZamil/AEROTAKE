using System.Net.Mail;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Pricing;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Suppliers;
using GrpcContract = Ota.CoreEngine.Grpc;

namespace Ota.CoreEngine.Bookings;

public sealed record ConsumerTravelerInput(
    string? FirstName, string? LastName, string? DateOfBirth, string? DocumentType, string? DocumentNumber,
    string? Nationality, string? Title, string? Gender, string? PassportExpiryDate = null);

public sealed record ConsumerReserveRequest(
    string? OfferId, string? IdempotencyKey, string? ContactEmail, string? ContactPhone,
    IReadOnlyList<ConsumerTravelerInput>? Travelers, decimal? ExpectedTotal, IReadOnlyList<string>? OfferIds = null);

/// <summary>The result of reserving. <see cref="ClaimToken"/> is unused for new bookings (P5-17: reserve requires a signed-in customer);
/// kept on the record so older guest-claim flows and tests stay typed. <see cref="PriceChange"/> is set (and nothing was reserved) when
/// the price is no longer the one the customer saw.</summary>
public sealed record ConsumerReservation(GuestBookingView? Booking, string? ClaimToken, decimal? PriceChange, string? PriceChangeCurrency, bool Replayed);

/// <summary>Booking for a consumer (B2C) — the counterpart of the agent's ReserveAsync, and deliberately a separate service: an agent
/// books on credit and sees margins; a consumer books to pay, and sees neither. It reserves the seats with the supplier and records a
/// PENDING booking owned by the signed-in customer (P5-17: guest create is closed). It does not take payment (a later step: SSLCommerz),
/// and it never debits an agent ledger.
///
/// The price is always recomputed here from the supplier's net rate and the tenant's consumer markup rule; the customer sends only
/// the total they were shown, and if it no longer matches nothing is reserved. Currency is the tenant's sell currency (converted
/// from the supplier quote server-side), never a label from the request.</summary>
public interface IConsumerBookingService
{
    Task<ConsumerReservation> ReserveAsync(Caller caller, ConsumerReserveRequest request, CancellationToken ct);
}

public sealed class ConsumerBookingService(
    OtaDbContext db,
    IMarkupResolver markups,
    IPricingCalculator pricing,
    ICurrencyConversion fx,
    ISupplierProvider suppliers,
    IOfferOwnership offerOwnership,
    IOfferSnapshots snapshots,
    IBookingEmailService emails,
    IConfiguration config,
    ILogger<ConsumerBookingService> logger) : IConsumerBookingService
{
    /// <summary>Seated travellers (adults+children) stay ≤ 9; lap infants add more names on the booking.</summary>
    public const int MaxTravelers = 18;

    /// <summary>How long a customer has to pay. Shorter than any supplier ticketing deadline, so an abandoned booking lapses on our side first.</summary>
    private TimeSpan PaymentWindow => TimeSpan.FromMinutes(int.TryParse(config["B2C:PaymentWindowMinutes"], out var m) && m > 0 ? m : 30);

    public async Task<ConsumerReservation> ReserveAsync(Caller caller, ConsumerReserveRequest request, CancellationToken ct)
    {
        if (caller.Channel != BookingChannels.B2C || caller.ActorType != ActorTypes.Customer || caller.CustomerId is null)
            throw new ServiceException(ErrorKind.PermissionDenied, "Sign in to reserve seats.");

        var input = Validate(request);

        // Idempotent replay: the same key returns the same booking — but only to whoever made it. A customer's booking to that customer;
        // a guest's to someone using the same email. Anyone else is told the key is taken, never given the booking.
        var existing = await db.Bookings.FirstOrDefaultAsync(b => b.IdempotencyKey == input.IdempotencyKey, ct);
        if (existing is not null) return Replay(caller, existing, input);

        // Price every leg before holding any of them. A changed price holds nothing.
        var tier = await markups.ResolveTierAsync(caller, ct); // no agent → Standard
        var rule = await markups.ResolveRuleAsync(caller, tier, ProductTypes.Flight, ct);
        var legs = new List<PricedLeg>();
        foreach (var offerId in input.OfferIds)
        {
            if (!await offerOwnership.IsOwnedByAsync(caller.TenantId, offerId, ct))
                throw new ServiceException(ErrorKind.FailedPrecondition, ErrorMessages.OfferExpiredOrUnknown);
            var snapshot = await snapshots.GetAsync(caller.TenantId, offerId, ct)
                ?? throw new ServiceException(ErrorKind.FailedPrecondition, ErrorMessages.OfferExpiredOrUnknown);
            var netRate = await suppliers.GetCachedNetRateAsync(offerId, ct)
                ?? throw new ServiceException(ErrorKind.FailedPrecondition, ErrorMessages.OfferExpiredOrUnknown);
            var taxAmount = await suppliers.GetCachedTaxAmountAsync(offerId, ct);
            var fromCurrency = !string.IsNullOrWhiteSpace(snapshot.SupplierCurrency) ? snapshot.SupplierCurrency : snapshot.Currency;
            var (net, tax, currency) = await fx.ToSellCurrencyAsync(caller.TenantId, netRate, taxAmount, fromCurrency, ct);
            var quote = pricing.Calculate(net, tier, rule, subAgentMarginOverride: null, currency, tax);
            if (legs.Count > 0 && legs[0].Quote.Currency != quote.Currency)
                throw new ServiceException(ErrorKind.FailedPrecondition, "These flights are not priced in the same currency.");
            legs.Add(new PricedLeg(offerId, snapshot, quote));
        }

        var total = legs.Sum(l => l.Quote.FinalPrice);
        if (request.ExpectedTotal is { } shown && Math.Round(shown, 2) != Math.Round(total, 2))
            return new ConsumerReservation(null, null, total, legs[0].Quote.Currency, Replayed: false);

        var holds = new List<BookingLegHold>();
        foreach (var leg in legs)
        {
            var reservation = await suppliers.CreateBookingAsync(new GrpcContract.B2BBookingRequest
            {
                Tenant = new GrpcContract.TenantContext { TenantId = caller.TenantId, Channel = GrpcContract.ChannelType.B2C },
                OfferId = leg.OfferId,
                IdempotencyKey = holds.Count == 0 ? input.IdempotencyKey : input.IdempotencyKey + ":" + holds.Count,
                ContactEmail = input.ContactEmail,
                ContactPhone = input.ContactPhone,
                PaymentMode = "CARD",
                Travelers = { input.Travelers },
            }, ct);
            if (!reservation.Success || string.IsNullOrWhiteSpace(reservation.SupplierPnrId))
            {
                logger.LogWarning("Supplier refused to hold offer {OfferId} for a consumer booking: {Reason}", leg.OfferId, reservation.FailureReason);
                await ReleaseHoldsAsync(holds, ct);
                throw new ServiceException(ErrorKind.FailedPrecondition, "The airline could not hold these seats. Please choose another flight.");
            }
            holds.Add(new BookingLegHold(leg.OfferId, leg.OfferId.Split('-')[0], reservation.SupplierPnrId));
        }

        var first = legs[0];
        var booking = new Booking
        {
            TenantId = caller.TenantId,
            Channel = BookingChannels.B2C,
            CustomerId = caller.CustomerId,
            GuestEmail = null,
            CustomerEmail = input.ContactEmail,
            Pnr = PnrGenerator.Next(),
            OfferId = first.OfferId,
            SupplierCode = holds[0].SupplierCode,
            SupplierNetRate = legs.Sum(l => l.Quote.SupplierNetRate),
            AgentMarkupPercent = first.Quote.AgentMarkupPercent,
            SubAgentMargin = 0,
            FinalPrice = total,
            Currency = first.Quote.Currency,
            IdempotencyKey = input.IdempotencyKey,
            TravelersJson = JsonSerializer.Serialize(input.Travelers.Select(t => new { t.FirstName, t.LastName, t.DocumentType, t.DocumentNumber })),
            ItineraryJson = JsonSerializer.Serialize(MergeSnapshots(legs)),
            LegsJson = BookingLegs.Serialize(holds),
            Status = BookingStatus.Pending, // reserved, not paid: the payment step confirms it
            SupplierPnrId = holds[0].SupplierPnrId,
            TicketingDeadline = DateTimeOffset.UtcNow.Add(PaymentWindow),
        };
        db.Bookings.Add(booking);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when ((ex.InnerException as Npgsql.PostgresException)?.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation)
        {
            // Two requests with one key raced; the other won. Answer as a replay of it.
            db.ChangeTracker.Clear();
            var winner = await db.Bookings.FirstAsync(b => b.IdempotencyKey == input.IdempotencyKey, ct);
            return Replay(caller, winner, input);
        }

        logger.LogInformation("Consumer booking {Pnr} reserved (supplier PNR {SupplierPnrId}), awaiting payment until {Deadline}",
            booking.Pnr, booking.SupplierPnrId, booking.TicketingDeadline);

        await emails.NotifyHeldAsync(booking, ct);

        return new ConsumerReservation(GuestAccessService.ToView(booking), ClaimToken: null, null, null, Replayed: false);
    }

    private static ConsumerReservation Replay(Caller caller, Booking existing, ValidInput input)
    {
        var mine = existing.Channel == BookingChannels.B2C && (caller.ActorType == ActorTypes.Customer
            ? existing.CustomerId == caller.CustomerId
            : existing.CustomerId is null && string.Equals(existing.GuestEmail, input.ContactEmail, StringComparison.OrdinalIgnoreCase));
        if (!mine) throw new ServiceException(ErrorKind.FailedPrecondition, "idempotency_key is already in use.");
        return new ConsumerReservation(GuestAccessService.ToView(existing), null, null, null, Replayed: true);
    }

    private sealed record PricedLeg(string OfferId, OfferSnapshot Snapshot, PriceQuote Quote);

    /// <summary>One itinerary for the confirmation. Each offer keeps the leg index it was shown with on a combined
    /// round trip; separately chosen legs are numbered in the order the customer picked them.</summary>
    private static OfferSnapshot MergeSnapshots(IReadOnlyList<PricedLeg> legs)
    {
        var segments = new List<FlightSegmentResult>();
        if (legs.Count == 1)
            segments.AddRange(legs[0].Snapshot.Segments);
        else
        {
            for (var i = 0; i < legs.Count; i++)
                segments.AddRange(legs[i].Snapshot.Segments.Select(s => s with { LegIndex = i }));
        }

        var first = legs[0].Snapshot;
        var bags = legs.All(l => l.Snapshot.CheckedBaggageIncluded);
        return new OfferSnapshot(
            string.Join(" · ", legs.Select(l => l.Snapshot.Title)),
            first.Currency,
            bags,
            bags ? legs.Min(l => l.Snapshot.CheckedBaggageWeightKg) : 0,
            segments,
            first.SupplierCurrency);
    }

    private async Task ReleaseHoldsAsync(IReadOnlyList<BookingLegHold> holds, CancellationToken ct)
    {
        foreach (var hold in holds)
        {
            try { await suppliers.CancelHoldAsync(hold.SupplierCode, hold.SupplierPnrId, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Could not release supplier hold {Pnr} ({Supplier}) after a later leg failed", hold.SupplierPnrId, hold.SupplierCode);
            }
        }
    }

    // ------------------------------------------------------------------------------------------ validation

    private const int MaxLegs = 5;

    private sealed record ValidInput(IReadOnlyList<string> OfferIds, string IdempotencyKey, string ContactEmail, string ContactPhone, List<GrpcContract.Traveler> Travelers);

    private static ValidInput Validate(ConsumerReserveRequest r)
    {
        static ServiceException Bad(string m) => new(ErrorKind.InvalidArgument, m);

        var fromList = r.OfferIds?.Select(id => id?.Trim() ?? "").Where(id => id.Length > 0).ToList();
        var offerIds = fromList is { Count: > 0 } ? fromList : [r.OfferId?.Trim() ?? ""];
        if (offerIds.Any(id => id.Length is 0 or > 200)) throw Bad("offerId is required.");
        if (offerIds.Count > MaxLegs) throw Bad($"A trip can include at most {MaxLegs} flights.");
        if (offerIds.Distinct(StringComparer.Ordinal).Count() != offerIds.Count) throw Bad("The same flight was selected twice.");
        var key = r.IdempotencyKey?.Trim();
        if (string.IsNullOrEmpty(key) || key.Length > 100) throw Bad("idempotencyKey is required (up to 100 characters).");

        var email = r.ContactEmail?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(email) || email.Length > 320 || !MailAddress.TryCreate(email, out var parsed) || parsed.Address != email)
            throw Bad("A valid contactEmail is required.");
        var phone = r.ContactPhone?.Trim() ?? "";
        if (phone.Length > 40) throw Bad("contactPhone is too long.");

        if (r.Travelers is not { Count: > 0 and <= MaxTravelers }) throw Bad($"Between 1 and {MaxTravelers} travelers are required.");
        var travelers = new List<GrpcContract.Traveler>();
        foreach (var t in r.Travelers)
        {
            var first = t.FirstName?.Trim();
            var last = t.LastName?.Trim();
            if (string.IsNullOrEmpty(first) || string.IsNullOrEmpty(last) || first.Length > 80 || last.Length > 80)
                throw Bad("Every traveler needs a first and last name (up to 80 characters).");
            var docType = t.DocumentType?.Trim().ToUpperInvariant() ?? "";
            var doc = (t.DocumentNumber?.Trim() ?? "").ToUpperInvariant();
            doc = System.Text.RegularExpressions.Regex.Replace(doc, "[^A-Z0-9]", "");
            if (doc.Length > 40) throw Bad("A document number is too long.");
            // Passport numbers are ICAO-ish: 6–12 alphanumeric characters and at least one digit (same rule as the storefront).
            if (docType is "PASSPORT" or "")
            {
                if (doc.Length is < 6 or > 12 || !doc.Any(char.IsDigit) || !doc.All(char.IsLetterOrDigit))
                    throw Bad("Every traveler needs a valid passport number (6–12 letters/digits, with at least one digit).");
            }
            else if (string.IsNullOrEmpty(doc))
            {
                throw Bad("Every traveler needs a document number.");
            }
            // Suppliers (Hajee's hold, for one) need the passport expiry; a value that is not a real date would only come back as a supplier error.
            var expiry = t.PassportExpiryDate?.Trim() ?? "";
            if (expiry.Length == 0 || !DateOnly.TryParseExact(expiry, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var expiryDate))
                throw Bad("A passport expiry date must look like 2032-01-31.");
            if (expiryDate < DateOnly.FromDateTime(DateTime.UtcNow.Date))
                throw Bad("Passport expiry must be a future date.");
            travelers.Add(new GrpcContract.Traveler
            {
                FirstName = first, LastName = last, DateOfBirth = t.DateOfBirth?.Trim() ?? "", DocumentNumber = doc,
                DocumentType = string.IsNullOrEmpty(docType) ? "PASSPORT" : docType, Nationality = t.Nationality?.Trim().ToUpperInvariant() ?? "",
                Title = t.Title?.Trim().ToLowerInvariant() ?? "", Gender = t.Gender?.Trim().ToLowerInvariant() ?? "", PassportExpiryDate = expiry,
            });
        }
        return new ValidInput(offerIds, key, email, phone, travelers);
    }
}
