using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Bookings;

/// <summary>What a person with no account may see of their own booking. Deliberately narrow: no passport or document numbers, no
/// supplier references, no net rate or margin — a reference and a surname are easy to learn, so they must never open anything
/// sensitive.</summary>
public sealed record GuestBookingView(
    Guid Id, string Reference, string Status, decimal Total, string Currency,
    DateTimeOffset? TicketingDeadline, DateTimeOffset CreatedAt, IReadOnlyList<GuestTraveler> Travelers,
    IReadOnlyList<ItinerarySegment>? Itinerary = null, bool CheckedBaggageIncluded = false, double CheckedBaggageWeightKg = 0,
    bool CanRequestCancel = false, string? CancelBlockedReason = null, string? CancelRequestStatus = null);

/// <summary>One flight of the trip as the customer saw it — no fare, no supplier.</summary>
public sealed record ItinerarySegment(
    string AirlineCode, string FlightNumber, string Origin, string Destination,
    DateTimeOffset DepartureTime, DateTimeOffset ArrivalTime, string DepartureTimeLocal, string ArrivalTimeLocal, int LegIndex);

public sealed record GuestTraveler(string FirstName, string LastName);

public enum ClaimOutcome { Attached, AlreadyYours, NotFound }

/// <summary>How someone without an account gets to their booking, and how a booking made as a guest later becomes part of an
/// account. Three ways in, each proving something different:
///   * an emailed CLAIM TOKEN — proves control of the mailbox the booking was made with;
///   * REFERENCE + SURNAME — what an airline's "manage booking" page accepts; weaker, so it is rate limited and reveals only the
///     narrow view above;
///   * a VERIFIED EMAIL at sign-in — the identity provider vouches for the mailbox, so guest bookings made with that address join
///     the account automatically.
/// Only consumer (B2C) bookings are reachable this way: an agent's booking is never exposed to a guest.</summary>
public interface IGuestAccessService
{
    /// <summary>Creates a token that lets the holder read this one booking until it expires. Returns the raw token, once — only its hash is stored.</summary>
    Task<string> IssueClaimTokenAsync(Booking booking, TimeSpan? lifetime, CancellationToken ct);

    Task<Booking?> FindByClaimTokenAsync(string? rawToken, CancellationToken ct);

    Task<Booking?> LookupAsync(string? reference, string? surname, CancellationToken ct);

    /// <summary>A guest booking whose contact address is this one — used to decide whether to email a link. Never reveals the result to the caller.</summary>
    Task<Booking?> FindByReferenceAndEmailAsync(string? reference, string? email, CancellationToken ct);

    /// <summary>Attaches every unowned guest booking made with this address to the customer. Only call with an email a provider verified. Returns how many.</summary>
    Task<int> AttachByVerifiedEmailAsync(Guid customerId, string verifiedEmail, CancellationToken ct);

    Task<ClaimOutcome> ClaimAsync(Guid customerId, string? rawToken, CancellationToken ct);
}

public sealed class GuestAccessService(OtaDbContext db, ILogger<GuestAccessService> logger) : IGuestAccessService
{
    public static readonly TimeSpan DefaultTokenLifetime = TimeSpan.FromDays(30);

    public async Task<string> IssueClaimTokenAsync(Booking booking, TimeSpan? lifetime, CancellationToken ct)
    {
        if (booking.Channel != BookingChannels.B2C) throw new InvalidOperationException("Only consumer bookings can be claimed by a guest.");

        var raw = Base64Url(RandomNumberGenerator.GetBytes(32)); // 256 bits: not guessable
        db.GuestClaimTokens.Add(new GuestClaimToken
        {
            TenantId = booking.TenantId, BookingId = booking.Id, TokenHash = Hash(raw),
            ExpiresAt = DateTimeOffset.UtcNow.Add(lifetime ?? DefaultTokenLifetime),
        });
        await db.SaveChangesAsync(ct);
        return raw;
    }

    public async Task<Booking?> FindByClaimTokenAsync(string? rawToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawToken) || rawToken.Length > 200) return null;

        var hash = Hash(rawToken);
        var now = DateTimeOffset.UtcNow;
        var bookingId = await db.GuestClaimTokens
            .Where(t => t.TokenHash == hash && t.ExpiresAt > now)
            .Select(t => (Guid?)t.BookingId).FirstOrDefaultAsync(ct);
        if (bookingId is null) return null;

        return await db.Bookings.FirstOrDefaultAsync(b => b.Id == bookingId && b.Channel == BookingChannels.B2C, ct);
    }

    public async Task<Booking?> LookupAsync(string? reference, string? surname, CancellationToken ct)
    {
        var pnr = reference?.Trim().ToUpperInvariant();
        var wanted = Fold(surname);
        if (string.IsNullOrEmpty(pnr) || pnr.Length > 12 || wanted.Length == 0) return null;

        var candidates = await db.Bookings.Where(b => b.Channel == BookingChannels.B2C && b.Pnr == pnr).ToListAsync(ct);
        return candidates.FirstOrDefault(b => Travelers(b).Any(t => Fold(t.LastName) == wanted));
    }

    public async Task<Booking?> FindByReferenceAndEmailAsync(string? reference, string? email, CancellationToken ct)
    {
        var pnr = reference?.Trim().ToUpperInvariant();
        var address = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(pnr) || pnr.Length > 12 || string.IsNullOrEmpty(address)) return null;

        return await db.Bookings.FirstOrDefaultAsync(b => b.Channel == BookingChannels.B2C && b.Pnr == pnr
            && (b.GuestEmail!.ToLower() == address || b.CustomerEmail!.ToLower() == address), ct);
    }

    public async Task<int> AttachByVerifiedEmailAsync(Guid customerId, string verifiedEmail, CancellationToken ct)
    {
        var address = verifiedEmail.Trim().ToLowerInvariant();
        if (address.Length == 0) return 0;

        // Only unowned, consumer, guest bookings — never one that already belongs to anyone, and never an agent's.
        var attached = await db.Bookings
            .Where(b => b.Channel == BookingChannels.B2C && b.CustomerId == null && b.AgentId == null && b.GuestEmail!.ToLower() == address)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.CustomerId, customerId), ct);
        if (attached > 0) logger.LogInformation("Attached {Count} guest booking(s) to customer {CustomerId} by verified email", attached, customerId);
        return attached;
    }

    public async Task<ClaimOutcome> ClaimAsync(Guid customerId, string? rawToken, CancellationToken ct)
    {
        var booking = await FindByClaimTokenAsync(rawToken, ct);
        if (booking is null) return ClaimOutcome.NotFound;
        if (booking.CustomerId == customerId) return ClaimOutcome.AlreadyYours;
        // Belongs to someone else: answer exactly as if the token were unknown.
        if (booking.CustomerId is not null || booking.AgentId is not null) return ClaimOutcome.NotFound;

        booking.CustomerId = customerId;
        var hash = Hash(rawToken!);
        var token = await db.GuestClaimTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (token is not null) token.ConsumedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return ClaimOutcome.Attached;
    }

    // ------------------------------------------------------------------------------------------ helpers

    public static GuestBookingView ToView(
        Booking b, bool canRequestCancel = false, string? cancelBlockedReason = null, string? cancelRequestStatus = null)
    {
        var trip = Trip(b);
        return new(
            b.Id, b.Pnr, b.Status.ToString(), b.FinalPrice, b.Currency, b.TicketingDeadline, b.CreatedAt,
            Travelers(b).Select(t => new GuestTraveler(t.FirstName, t.LastName)).ToList(),
            trip?.Segments.Select(s => new ItinerarySegment(s.AirlineCode, s.FlightNumber, s.Origin, s.Destination, s.DepartureTime, s.ArrivalTime,
                s.DepartureTimeLocal, s.ArrivalTimeLocal, s.LegIndex)).ToList(),
            trip?.CheckedBaggageIncluded ?? false, trip?.CheckedBaggageWeightKg ?? 0,
            canRequestCancel, cancelBlockedReason, cancelRequestStatus);
    }

    /// <summary>The itinerary snapshot, if the booking has one (agent bookings predate it). Never throws on a damaged value.</summary>
    private static Suppliers.OfferSnapshot? Trip(Booking b)
    {
        if (string.IsNullOrEmpty(b.ItineraryJson)) return null;
        try { return JsonSerializer.Deserialize<Suppliers.OfferSnapshot>(b.ItineraryJson); }
        catch (JsonException) { return null; }
    }

    /// <summary>Only names, ever: TravelersJson also holds document numbers, which never leave this class.</summary>
    private static IEnumerable<(string FirstName, string LastName)> Travelers(Booking b)
    {
        try
        {
            using var doc = JsonDocument.Parse(b.TravelersJson);
            var found = new List<(string, string)>();
            foreach (var t in doc.RootElement.EnumerateArray())
                found.Add((Str(t, "FirstName"), Str(t, "LastName")));
            return found;
        }
        catch (JsonException) { return []; }

        static string Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
    }

    /// <summary>Case, accents and spacing must not decide whether "Rahmán " is "rahman".</summary>
    internal static string Fold(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "";
        var decomposed = name.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var ch in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark && !char.IsWhiteSpace(ch)) sb.Append(char.ToLowerInvariant(ch));
        return sb.ToString();
    }

    private static string Hash(string raw) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
