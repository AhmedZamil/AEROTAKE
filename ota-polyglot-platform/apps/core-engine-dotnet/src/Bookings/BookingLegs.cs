using System.Text.Json;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Bookings;

/// <summary>One supplier hold inside a booking. A round trip that the airline priced as one offer is a single hold.
/// A multi-city trip the customer built from separate offers is one hold per leg, still one booking and one payment.</summary>
public sealed record BookingLegHold(string OfferId, string SupplierCode, string SupplierPnrId);

public static class BookingLegs
{
    /// <summary>Null when there is only one hold — the booking columns already store it.</summary>
    public static string? Serialize(IReadOnlyList<BookingLegHold> holds) =>
        holds.Count <= 1 ? null : JsonSerializer.Serialize(holds);

    /// <summary>Every hold that must be ticketed or released. Falls back to the single supplier columns.</summary>
    public static IReadOnlyList<BookingLegHold> Read(Booking booking)
    {
        if (!string.IsNullOrWhiteSpace(booking.LegsJson))
        {
            try
            {
                var legs = JsonSerializer.Deserialize<List<BookingLegHold>>(booking.LegsJson);
                if (legs is { Count: > 0 }) return legs;
            }
            catch (JsonException)
            {
                // Damaged JSON falls through to the single-hold columns.
            }
        }

        if (string.IsNullOrWhiteSpace(booking.SupplierCode) || string.IsNullOrWhiteSpace(booking.SupplierPnrId))
            return [];
        return [new BookingLegHold(booking.OfferId, booking.SupplierCode, booking.SupplierPnrId)];
    }
}
