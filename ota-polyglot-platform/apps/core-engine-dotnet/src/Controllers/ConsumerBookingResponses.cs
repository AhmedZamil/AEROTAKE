using Microsoft.AspNetCore.Mvc;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Controllers;

/// <summary>What the consumer booking endpoints answer with — the same mapping for a guest's and a signed-in customer's request. The body is
/// always the narrow <see cref="GuestBookingView"/>: itinerary, travellers, the total the customer pays and when it lapses — never a net rate,
/// margin, supplier code or supplier reference (P4-8).</summary>
internal static class ConsumerBookingResponses
{
    public static async Task<IActionResult> ReserveAsync(ControllerBase c, Func<Task<ConsumerReservation>> reserve, Func<ConsumerReservation, Task>? afterCreate = null)
    {
        ConsumerReservation result;
        try { result = await reserve(); }
        catch (ServiceException ex)
        {
            var (status, code) = ex.Kind switch
            {
                ErrorKind.InvalidArgument => (400, "invalid_request"),
                ErrorKind.NotFound => (404, "not_found"),
                ErrorKind.PermissionDenied => (403, "forbidden"),
                _ => (409, "booking_conflict"),
            };
            return new ObjectResult(new { error = code, message = ex.Message }) { StatusCode = status };
        }

        if (result.PriceChange is { } newTotal)
            return c.Conflict(new { error = "price_changed", message = "The price has changed since you searched. Please review the new price.", newTotal, currency = result.PriceChangeCurrency });

        if (afterCreate is not null && !result.Replayed) await afterCreate(result);
        // 201 for a new booking, 200 for the replay of an earlier request with the same idempotency key.
        return new ObjectResult(new { booking = result.Booking }) { StatusCode = result.Replayed ? 200 : 201 };
    }
}
