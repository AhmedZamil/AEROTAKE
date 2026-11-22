using System.Globalization;
using System.Text;
using System.Text.Json;
using Ota.CoreEngine.Auth; // IEmailSender (SMTP) — not JWT/identity
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Observability;
using Ota.CoreEngine.Suppliers;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Bookings;

/// <summary>P5-18: transactional mail for the B2C booking lifecycle. Delivery failures are logged and alerted;
/// they never throw back into reserve / pay / ticket paths.</summary>
public interface IBookingEmailService
{
    /// <summary>True when the mail was handed to SMTP (or permanently skipped); false when send threw so a reminder can retry.</summary>
    Task<bool> NotifyHeldAsync(Booking booking, CancellationToken ct);
    Task<bool> NotifyPaymentReceivedAsync(Booking booking, Payment payment, CancellationToken ct);
    Task<bool> NotifyTicketIssuedAsync(Booking booking, CancellationToken ct);
    Task<bool> NotifyHoldExpiringAsync(Booking booking, CancellationToken ct);
    Task<bool> NotifyFailureAsync(Booking booking, string reasonCode, string customerMessage, CancellationToken ct);
}

public sealed class BookingEmailService(
    IEmailSender email,
    IGuestAccessService guests,
    IStorefrontTenants storefronts,
    IAlertNotifier alerts,
    ILogger<BookingEmailService> logger) : IBookingEmailService
{
    public Task<bool> NotifyHeldAsync(Booking booking, CancellationToken ct) =>
        SendAsync(booking, $"Booking held — {booking.Pnr}", BuildHeldBody, "hold_confirmation", ct);

    public Task<bool> NotifyPaymentReceivedAsync(Booking booking, Payment payment, CancellationToken ct) =>
        SendAsync(booking, $"Payment received — {booking.Pnr}",
            (b, url) => BuildPaymentReceivedBody(b, payment, url), "payment_receipt", ct);

    public async Task<bool> NotifyTicketIssuedAsync(Booking booking, CancellationToken ct)
    {
        // Claim token rides in the URL fragment so mail clients open the print-ready itinerary without a login.
        string? claim = null;
        try { claim = await guests.IssueClaimTokenAsync(booking, lifetime: null, ct); }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not issue claim token for ticket email on booking {Pnr}", booking.Pnr);
        }
        return await SendAsync(booking, $"Your e-ticket — {booking.Pnr}",
            (b, url) => BuildTicketBody(b, url, claim), "ticket_issued", ct);
    }

    public Task<bool> NotifyHoldExpiringAsync(Booking booking, CancellationToken ct) =>
        SendAsync(booking, $"Pay soon — hold expiring for {booking.Pnr}", BuildHoldExpiringBody, "hold_expiring", ct);

    public Task<bool> NotifyFailureAsync(Booking booking, string reasonCode, string customerMessage, CancellationToken ct) =>
        SendAsync(booking, $"Update on booking {booking.Pnr}",
            (b, url) => BuildFailureBody(b, reasonCode, customerMessage, url), "booking_failure", ct);

    private async Task<bool> SendAsync(
        Booking booking,
        string subject,
        Func<Booking, string?, string> bodyBuilder,
        string what,
        CancellationToken ct)
    {
        if (booking.Channel != BookingChannels.B2C) return true;

        var to = ContactEmail(booking);
        if (to is null)
        {
            logger.LogWarning("No contact email on booking {Pnr} — skipping {What} mail", booking.Pnr, what);
            return true;
        }

        string? baseUrl = null;
        try { baseUrl = await storefronts.PublicBaseUrlAsync(booking.TenantId, ct); }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not resolve storefront URL for {What} email on booking {Pnr}", what, booking.Pnr);
        }

        var body = bodyBuilder(booking, baseUrl);
        try
        {
            await email.SendAsync(to, subject, body, ct);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not send {What} email for booking {Pnr} to {To}", what, booking.Pnr, to);
            try
            {
                await alerts.NotifyAsync($"Transactional email failed ({what})", ex, new Dictionary<string, string>
                {
                    ["booking"] = booking.Pnr,
                    ["to"] = to,
                    ["subject"] = subject,
                    ["what"] = what,
                }, ct);
            }
            catch (Exception alertEx)
            {
                logger.LogError(alertEx, "Could not alert after {What} email failure for {Pnr}", what, booking.Pnr);
            }
            return false;
        }
    }

    private static string? ContactEmail(Booking booking)
    {
        var address = (booking.CustomerEmail ?? booking.GuestEmail)?.Trim();
        return string.IsNullOrEmpty(address) ? null : address;
    }

    private static string BuildHeldBody(Booking booking, string? baseUrl)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Your seats are held for booking {booking.Pnr}.");
        sb.AppendLine();
        AppendTrip(sb, booking);
        sb.AppendLine($"Total to pay: {Money(booking.FinalPrice, booking.Currency)}");
        if (booking.TicketingDeadline is { } deadline)
            sb.AppendLine($"Please pay by {deadline.UtcDateTime:yyyy-MM-dd HH:mm} UTC. After that the hold is released.");
        sb.AppendLine();
        AppendLink(sb, "Complete payment", PayUrl(baseUrl));
        AppendLink(sb, "View booking", MyBookingsUrl(baseUrl));
        sb.AppendLine();
        sb.AppendLine("If you did not make this booking, you can ignore this email.");
        return sb.ToString();
    }

    private static string BuildPaymentReceivedBody(Booking booking, Payment payment, string? baseUrl)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"We received your payment for booking {booking.Pnr}.");
        sb.AppendLine();
        sb.AppendLine($"Amount paid: {Money(payment.Amount, payment.Currency)}");
        AppendTrip(sb, booking);
        sb.AppendLine("We are issuing your ticket with the airline. You will receive another email when it is ready.");
        sb.AppendLine();
        AppendLink(sb, "View booking", MyBookingsUrl(baseUrl));
        return sb.ToString();
    }

    private static string BuildTicketBody(Booking booking, string? baseUrl, string? claimToken)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Your ticket is ready for booking {booking.Pnr}.");
        sb.AppendLine();
        sb.AppendLine($"Booking reference (PNR): {booking.Pnr}");
        AppendTrip(sb, booking);
        AppendTravelers(sb, booking);
        sb.AppendLine($"Total paid: {Money(booking.FinalPrice, booking.Currency)}");
        sb.AppendLine();
        AppendLink(sb, "View / print e-ticket", ItineraryUrl(baseUrl, booking.Id, claimToken));
        AppendLink(sb, "My bookings", MyBookingsUrl(baseUrl));
        AppendLink(sb, "Manage booking", ManageBookingUrl(baseUrl));
        sb.AppendLine();
        sb.AppendLine("Open the e-ticket link to print or save a PDF. Present your booking reference at the airport — this is not a boarding pass.");
        return sb.ToString();
    }

    private static string BuildHoldExpiringBody(Booking booking, string? baseUrl)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Your unpaid hold for booking {booking.Pnr} is about to expire.");
        sb.AppendLine();
        if (booking.TicketingDeadline is { } deadline)
            sb.AppendLine($"Pay by {deadline.UtcDateTime:yyyy-MM-dd HH:mm} UTC or the seats will be released.");
        sb.AppendLine($"Amount due: {Money(booking.FinalPrice, booking.Currency)}");
        AppendTrip(sb, booking);
        sb.AppendLine();
        AppendLink(sb, "Pay now", PayUrl(baseUrl));
        return sb.ToString();
    }

    private static string BuildFailureBody(Booking booking, string reasonCode, string customerMessage, string? baseUrl)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"There was a problem with booking {booking.Pnr}.");
        sb.AppendLine();
        sb.AppendLine(customerMessage);
        sb.AppendLine();
        AppendTrip(sb, booking);
        sb.AppendLine($"Reference: {booking.Pnr}");
        if (reasonCode is "ticket_failed" or "hold_expired")
            sb.AppendLine("If you were charged, a refund has been started. It can take a few business days to appear on your statement.");
        else if (reasonCode == "payment_failed")
            sb.AppendLine("No ticket was issued. You can try paying again from My Bookings while the hold is still open.");
        sb.AppendLine();
        AppendLink(sb, "My bookings", MyBookingsUrl(baseUrl));
        AppendLink(sb, "Manage booking", ManageBookingUrl(baseUrl));
        return sb.ToString();
    }

    private static void AppendTrip(StringBuilder sb, Booking booking)
    {
        var trip = ReadTrip(booking);
        if (trip?.Segments is not { Count: > 0 })
        {
            sb.AppendLine("Flights: see your booking on the website for details.");
            sb.AppendLine();
            return;
        }

        sb.AppendLine("Flights:");
        foreach (var s in trip.Segments)
        {
            var dep = !string.IsNullOrWhiteSpace(s.DepartureTimeLocal)
                ? s.DepartureTimeLocal
                : s.DepartureTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
            sb.AppendLine($"  {s.AirlineCode}{s.FlightNumber}  {s.Origin} → {s.Destination}  {dep}");
        }
        sb.AppendLine();
    }

    private static void AppendTravelers(StringBuilder sb, Booking booking)
    {
        var names = ReadTravelerNames(booking);
        if (names.Count == 0) return;
        sb.AppendLine("Travellers:");
        foreach (var name in names) sb.AppendLine($"  {name}");
        sb.AppendLine();
    }

    private static OfferSnapshot? ReadTrip(Booking booking)
    {
        if (string.IsNullOrEmpty(booking.ItineraryJson)) return null;
        try { return JsonSerializer.Deserialize<OfferSnapshot>(booking.ItineraryJson); }
        catch (JsonException) { return null; }
    }

    private static List<string> ReadTravelerNames(Booking booking)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrEmpty(booking.TravelersJson) ? "[]" : booking.TravelersJson);
            return doc.RootElement.EnumerateArray()
                .Select(t =>
                {
                    var first = t.TryGetProperty("FirstName", out var f) ? f.GetString() : null;
                    var last = t.TryGetProperty("LastName", out var l) ? l.GetString() : null;
                    return $"{first} {last}".Trim();
                })
                .Where(n => n.Length > 0)
                .ToList();
        }
        catch (JsonException) { return []; }
    }

    private static string Money(decimal amount, string currency) =>
        string.Create(CultureInfo.InvariantCulture, $"{currency} {amount:0.00}");

    private static string? MyBookingsUrl(string? baseUrl) => baseUrl is null ? null : $"{baseUrl}/my-bookings";
    private static string? ManageBookingUrl(string? baseUrl) => baseUrl is null ? null : $"{baseUrl}/manage-booking";
    private static string? PayUrl(string? baseUrl) => MyBookingsUrl(baseUrl);

    /// <summary>P5-21: print-ready itinerary. Claim stays in the fragment (same pattern as manage-booking) so it is not sent as a Referer.</summary>
    private static string? ItineraryUrl(string? baseUrl, Guid bookingId, string? claimToken)
    {
        if (baseUrl is null) return null;
        var url = $"{baseUrl}/booking/itinerary/{bookingId:D}";
        return string.IsNullOrWhiteSpace(claimToken) ? url : $"{url}#claim={claimToken}";
    }

    private static void AppendLink(StringBuilder sb, string label, string? url)
    {
        if (url is null) return;
        sb.AppendLine($"{label}: {url}");
    }
}
