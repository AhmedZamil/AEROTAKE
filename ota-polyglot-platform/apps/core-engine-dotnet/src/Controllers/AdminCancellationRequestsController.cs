using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Controllers;

public sealed record AdminResolveCancellationRequest(string? Note);

/// <summary>P5-30: platform-admin inbox for cancellation requests that were stored for ops (a confirmed ticket, or an
/// unknown ticket outcome). Completing one refunds money after the airline void; it does not call the supplier.</summary>
[ApiController]
[Route("api/v1/admin/cancellation-requests")]
[Authorize(Policy = RestPolicies.PlatformAdmin)]
public sealed class AdminCancellationRequestsController(IBookingCancellationService cancellations) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? status,
        [FromQuery] string? channel,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default) =>
        Ok(await cancellations.ListForAdminAsync(status, channel, page, pageSize, ct));

    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] AdminResolveCancellationRequest? request, CancellationToken ct)
    {
        try
        {
            return Ok(await cancellations.CompleteForAdminAsync(id, request?.Note, ct));
        }
        catch (ServiceException ex)
        {
            return Map(ex);
        }
    }

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] AdminResolveCancellationRequest? request, CancellationToken ct)
    {
        try
        {
            return Ok(await cancellations.RejectForAdminAsync(id, request?.Note, ct));
        }
        catch (ServiceException ex)
        {
            return Map(ex);
        }
    }

    private IActionResult Map(ServiceException ex) => ex.Kind switch
    {
        ErrorKind.NotFound => NotFound(new { error = ex.Code ?? "not_found", message = ex.Message }),
        ErrorKind.InvalidArgument => BadRequest(new { error = ex.Code ?? "invalid_request", message = ex.Message }),
        _ => Conflict(new { error = ex.Code ?? "cancel_not_open", message = ex.Message }),
    };
}
