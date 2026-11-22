using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.RateLimiting;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Controllers;

public sealed record GuestLookupRequest(string? Reference, string? LastName);
public sealed record GuestAccessRequest(string? ClaimToken);
public sealed record GuestSendLinkRequest(string? Reference, string? Email);
public sealed record GuestCancelRequest(Guid? BookingId, string? ClaimToken, string? Reference, string? LastName, string? Reason);
public sealed record ReserveBookingRequest(
    string? OfferId, string? IdempotencyKey, string? ContactEmail, string? ContactPhone,
    List<ConsumerTravelerInput>? Travelers, decimal? ExpectedTotal, List<string>? OfferIds = null)
{
    public ConsumerReserveRequest ToService() => new(OfferId, IdempotencyKey, ContactEmail, ContactPhone, Travelers, ExpectedTotal, OfferIds);
}

/// <summary>Booking access for someone who never made an account: the storefront's "manage booking" page. Anonymous by nature, so
/// three things hold everywhere in here: the tenant must be a live B2C storefront (X-Tenant-ID is checked, not trusted); every
/// failure is the SAME 404 whether the booking is missing, the name wrong, or the token expired (no way to tell which); and only
/// the narrow <see cref="GuestBookingView"/> ever leaves — never document numbers, supplier references or margins.</summary>
[ApiController]
[Route("api/v1/guest/bookings")]
[AllowAnonymous]
public sealed class GuestBookingsController(
    IStorefrontTenants storefronts,
    IGuestAccessService guests,
    IBookingCancellationService cancellations,
    IEmailSender email,
    IAbuseGuard guard,
    ILogger<GuestBookingsController> logger) : ControllerBase
{
    private IActionResult NoSuchBooking() => NotFound(new { error = "booking_not_found", message = "We couldn't find a booking with those details." });

    private async Task<IActionResult?> RejectUnlessStorefrontAsync(CancellationToken ct) =>
        await storefronts.IsB2CAsync(HttpContext.Request.Headers["X-Tenant-ID"].ToString(), ct)
            ? null
            : NotFound(new { error = "unknown_tenant", message = "This site does not offer booking lookup." });

    /// <summary>P5-17: creating a booking as a guest is closed. Search stays public; reserve requires a signed-in customer
    /// (POST /api/v1/customers/me/bookings). Lookup / claim-link / send-link below still serve existing bookings.</summary>
    [HttpPost]
    public IActionResult Reserve() =>
        Unauthorized(new { error = "login_required", message = "Sign in to reserve seats." });

    /// <summary>Booking reference + a traveller's surname.</summary>
    [HttpPost("lookup")]
    public async Task<IActionResult> Lookup(GuestLookupRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.GuestLookupPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;

        // The limit that actually protects bookings: a reference only ever gets a handful of WRONG surnames, from anywhere. Checked
        // before the lookup, counted after a failure — so a customer who gets it right is never penalised. (Trade-off: someone
        // hammering a victim's reference can lock out its surname lookup for a while; the emailed link is unaffected.)
        var referenceKey = $"{HttpContext.Request.Headers["X-Tenant-ID"]}:{request.Reference?.Trim().ToUpperInvariant()}";
        if (await guard.CheckAsync(HttpContext, AbuseLimits.GuestLookupFailuresPerReference, referenceKey, ct) is { } locked) return locked;

        var booking = await guests.LookupAsync(request.Reference, request.LastName, ct);
        if (booking is null)
        {
            await guard.RecordFailureAsync(AbuseLimits.GuestLookupFailuresPerReference, referenceKey, ct);
            return NoSuchBooking();
        }
        return Ok(await cancellations.ToViewAsync(booking, ct));
    }

    /// <summary>The token from an emailed link.</summary>
    [HttpPost("access")]
    public async Task<IActionResult> Access(GuestAccessRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.GuestAccessPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;

        var booking = await guests.FindByClaimTokenAsync(request.ClaimToken, ct);
        return booking is null ? NoSuchBooking() : Ok(await cancellations.ToViewAsync(booking, ct));
    }

    /// <summary>P5-20: cancel as a manage-booking claimant. Proof is a claim token, or the same reference + surname as lookup.</summary>
    [HttpPost("cancel")]
    public async Task<IActionResult> Cancel(GuestCancelRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.GuestCancelPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;
        if (request.BookingId is null || request.BookingId == Guid.Empty)
            return BadRequest(new { error = "invalid_request", message = "bookingId is required." });

        try
        {
            var view = await cancellations.RequestCancelAsGuestAsync(
                request.BookingId.Value, request.ClaimToken, request.Reference, request.LastName, request.Reason, ct);
            return Ok(view);
        }
        catch (SharedKernel.ServiceException ex) when (ex.Kind == SharedKernel.ErrorKind.NotFound)
        {
            return NoSuchBooking();
        }
        catch (SharedKernel.ServiceException ex) when (ex.Kind == SharedKernel.ErrorKind.FailedPrecondition)
        {
            return Conflict(new { error = ex.Code ?? "cancel_not_allowed", message = ex.Message });
        }
    }

    /// <summary>"Email me a link": reference + the address the booking was made with. ALWAYS 202 — a match sends a link, a non-match
    /// sends nothing, and the caller cannot tell which, so this cannot be used to learn whose bookings exist.</summary>
    [HttpPost("send-link")]
    public async Task<IActionResult> SendLink(GuestSendLinkRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.SendLinkPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;
        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();

        // Per-TARGET limits are silent — over the limit we still answer 202, we just send nothing — so they cannot be probed to learn
        // whether an address or a reference exists, and they stop one stranger filling someone else's inbox with links. Both are
        // always counted, whether or not anything matches, for the same reason.
        var emailAllowed = await guard.AllowQuietlyAsync(AbuseLimits.SendLinkPerEmail, $"{tenantId}:{request.Email}", ct);
        var referenceAllowed = await guard.AllowQuietlyAsync(AbuseLimits.SendLinkPerReference, $"{tenantId}:{request.Reference}", ct);

        var booking = emailAllowed && referenceAllowed ? await guests.FindByReferenceAndEmailAsync(request.Reference, request.Email, ct) : null;
        var baseUrl = booking is null ? null : await storefronts.PublicBaseUrlAsync(tenantId, ct);
        if (booking is not null && baseUrl is not null)
        {
            var token = await guests.IssueClaimTokenAsync(booking, lifetime: null, ct);
            // The token rides in the URL FRAGMENT (#), which browsers never send to a server, so it stays out of access logs and Referer headers.
            var link = $"{baseUrl}/manage-booking#claim={token}";
            try
            {
                await email.SendAsync(request.Email!.Trim(), $"Your booking {booking.Pnr}",
                    $"Use this link to view your booking {booking.Pnr}:\n\n{link}\n\nIt works for 30 days. If you did not ask for this, you can ignore this email.", ct);
            }
            catch (Exception ex)
            {
                // Say nothing to the caller either way — a failure here must not become a signal.
                logger.LogError(ex, "Could not send the booking link for booking {BookingId}", booking.Id);
            }
        }
        return Accepted(new { message = "If a booking matches, we have emailed a link to that address." });
    }
}
