using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Observability;
using Ota.CoreEngine.Payments;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Suppliers;

namespace Ota.CoreEngine.Bookings;

/// <summary>P5-20: a customer (or manage-booking claimant) asks to cancel. Unpaid holds and paid-but-unticketed bookings
/// are cancelled and refunded here. A Confirmed ticket is stored as a request and alerted — we do not blindly refund a
/// ticket that may still be valid at the airline.</summary>
public interface IBookingCancellationService
{
    Task<GuestBookingView> RequestCancelAsync(Caller caller, Guid bookingId, string? customerNote, CancellationToken ct);

    /// <summary>Same as <see cref="RequestCancelAsync"/> for a guest who proves access with a claim token or reference + surname.</summary>
    Task<GuestBookingView> RequestCancelAsGuestAsync(
        Guid bookingId, string? claimToken, string? reference, string? lastName, string? customerNote, CancellationToken ct);

    Task<GuestBookingView> ToViewAsync(Booking booking, CancellationToken ct);
    Task<IReadOnlyList<GuestBookingView>> ToViewsAsync(IReadOnlyList<Booking> bookings, CancellationToken ct);

    /// <summary>P5-30: the company inbox. Tenant comes from the caller's token (the query filter). Not a customer view —
    /// it includes the supplier PNR ops need to void the ticket, and never the net rate or markup.</summary>
    Task<AdminCancellationList> ListForAdminAsync(string? status, string? channel, int page, int pageSize, CancellationToken ct);

    /// <summary>Ops have already cancelled with the airline. Completes the request and refunds a paid booking.
    /// Does not call supplier hold-cancel. A failed refund leaves the request open.</summary>
    Task<AdminCancellationItem> CompleteForAdminAsync(Guid requestId, string? opsNote, CancellationToken ct);

    /// <summary>Ops decline the request. The booking stays as it is. A reason is required.</summary>
    Task<AdminCancellationItem> RejectForAdminAsync(Guid requestId, string? opsNote, CancellationToken ct);
}

public sealed record AdminCancellationList(IReadOnlyList<AdminCancellationItem> Items, int TotalCount, int Page, int PageSize);

/// <summary>One cancel request as a platform admin sees it. No net rate, markup, margin, or passport numbers.</summary>
public sealed record AdminCancellationItem(
    Guid Id,
    Guid BookingId,
    string Pnr,
    string Channel,
    string BookingStatus,
    string? ContactEmail,
    decimal Total,
    string Currency,
    string? CustomerNote,
    string? OpsNote,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ResolvedAt,
    string? SupplierPnr,
    string SupplierCode,
    string? RouteSummary,
    IReadOnlyList<string> Travelers,
    string? PaymentStatus,
    Guid? RefundId,
    string? RefundStatus);

public sealed class BookingCancellationService(
    OtaDbContext db,
    IGuestAccessService guests,
    ISupplierProvider suppliers,
    IPaymentGateway gateway,
    IWalletService wallets,
    IAlertNotifier alerts,
    ILogger<BookingCancellationService> logger) : IBookingCancellationService
{
    public async Task<GuestBookingView> RequestCancelAsync(Caller caller, Guid bookingId, string? customerNote, CancellationToken ct)
    {
        var booking = await db.Bookings.VisibleTo(caller).FirstOrDefaultAsync(b => b.Id == bookingId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Booking not found.");
        if (!BookingAccess.CanControl(caller, booking.Owner()))
            throw new ServiceException(ErrorKind.NotFound, "Booking not found.");
        return await ProcessAsync(booking, customerNote, ct);
    }

    public async Task<GuestBookingView> RequestCancelAsGuestAsync(
        Guid bookingId, string? claimToken, string? reference, string? lastName, string? customerNote, CancellationToken ct)
    {
        Booking? proven = null;
        if (!string.IsNullOrWhiteSpace(claimToken))
            proven = await guests.FindByClaimTokenAsync(claimToken, ct);
        else if (!string.IsNullOrWhiteSpace(reference) && !string.IsNullOrWhiteSpace(lastName))
            proven = await guests.LookupAsync(reference, lastName, ct);

        if (proven is null || proven.Id != bookingId)
            throw new ServiceException(ErrorKind.NotFound, "Booking not found.");

        // Re-load under the tenant filter so subsequent writes are tracked normally.
        var booking = await db.Bookings.FirstOrDefaultAsync(b => b.Id == bookingId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Booking not found.");
        return await ProcessAsync(booking, customerNote, ct);
    }

    public async Task<GuestBookingView> ToViewAsync(Booking booking, CancellationToken ct)
    {
        var views = await ToViewsAsync([booking], ct);
        return views[0];
    }

    public async Task<IReadOnlyList<GuestBookingView>> ToViewsAsync(IReadOnlyList<Booking> bookings, CancellationToken ct)
    {
        if (bookings.Count == 0) return [];
        var ids = bookings.Select(b => b.Id).ToList();
        var paid = (await db.Payments.AsNoTracking()
            .Where(p => ids.Contains(p.BookingId) && p.Status == PaymentStatus.Paid)
            .Select(p => p.BookingId)
            .ToListAsync(ct)).ToHashSet();
        var cancels = await db.CancellationRequests.AsNoTracking()
            .Where(c => ids.Contains(c.BookingId))
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync(ct);
        var latest = cancels.GroupBy(c => c.BookingId).ToDictionary(g => g.Key, g => g.First());

        return bookings.Select(b =>
        {
            latest.TryGetValue(b.Id, out var cancel);
            var (can, reason) = Evaluate(b, paid.Contains(b.Id), cancel);
            return GuestAccessService.ToView(b, can, reason, cancel?.Status.ToString());
        }).ToList();
    }

    private async Task<GuestBookingView> ProcessAsync(Booking booking, string? customerNote, CancellationToken ct)
    {
        if (booking.Channel != BookingChannels.B2C)
            throw new ServiceException(ErrorKind.NotFound, "Booking not found.");

        var note = string.IsNullOrWhiteSpace(customerNote) ? null : customerNote.Trim();
        if (note is { Length: > 500 }) note = note[..500];

        var paidPayment = await db.Payments
            .Where(p => p.BookingId == booking.Id && p.Status == PaymentStatus.Paid)
            .OrderByDescending(p => p.PaidAt)
            .FirstOrDefaultAsync(ct);

        var existing = await db.CancellationRequests
            .Where(c => c.BookingId == booking.Id)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(ct);

        // Idempotent: asking again while ops still has the request just returns the same booking view.
        if (existing is { Status: CancellationRequestStatus.Requested })
            return await ToViewAsync(booking, ct);

        var ticketingUnknown = paidPayment is not null && await db.PaymentAttempts
            .AnyAsync(a => a.PaymentId == paidPayment.Id && a.FailureReason == PaidBookingCompleter.TicketingUnknownMarker, ct);

        var (can, blocked) = Evaluate(booking, paidPayment is not null, existing);
        if (!can)
            throw new ServiceException(ErrorKind.FailedPrecondition, blocked ?? "This booking cannot be cancelled.", "cancel_not_allowed");

        // Confirmed ticket, or Paid+Pending after an unknown ticket outcome: never auto-refund — store for ops.
        if (booking.Status == BookingStatus.Confirmed || ticketingUnknown)
        {
            var request = new CancellationRequest
            {
                TenantId = booking.TenantId,
                BookingId = booking.Id,
                Status = CancellationRequestStatus.Requested,
                CustomerNote = note,
            };
            db.CancellationRequests.Add(request);
            await db.SaveChangesAsync(ct);

            var why = ticketingUnknown
                ? $"Customer asked to cancel paid booking {booking.Pnr} with unknown ticket outcome."
                : $"Customer asked to cancel confirmed booking {booking.Pnr}.";
            await alerts.NotifyAsync(
                $"Cancel request for booking {booking.Pnr}",
                new CancellationRequestException(why),
                new Dictionary<string, string>
                {
                    ["bookingId"] = booking.Id.ToString(),
                    ["pnr"] = booking.Pnr,
                    ["status"] = booking.Status.ToString(),
                    ["ticketingUnknown"] = ticketingUnknown ? "true" : "false",
                    ["note"] = note ?? "",
                },
                ct);
            logger.LogInformation("Cancel request {RequestId} stored for booking {Pnr} (confirmedOrUnknown={Unknown})",
                request.Id, booking.Pnr, ticketingUnknown);
            return await ToViewAsync(booking, ct);
        }

        // Pending (unpaid, or paid but not yet ticketed): release the hold. Refund only when money was already taken.
        await ReleaseHoldsAsync(booking, ct);
        booking.Status = BookingStatus.Cancelled;
        booking.UpdatedAt = DateTimeOffset.UtcNow;

        var requestDone = new CancellationRequest
        {
            TenantId = booking.TenantId,
            BookingId = booking.Id,
            Status = CancellationRequestStatus.Completed,
            CustomerNote = note,
            ResolvedAt = DateTimeOffset.UtcNow,
        };
        db.CancellationRequests.Add(requestDone);

        if (paidPayment is not null)
        {
            var refund = await RefundPaidAsync(paidPayment, "customer_cancel", "Customer cancelled before the ticket was issued.", ct);
            requestDone.RefundId = refund?.Id;
            if (refund is null || refund.Status != RefundStatus.Succeeded)
            {
                // Hold is gone locally; money may still need ops. Leave a Requested-shaped alert.
                await alerts.NotifyAsync(
                    $"Cancel refund failed for booking {booking.Pnr}",
                    new CancellationRequestException($"Booking {booking.Pnr} was cancelled but the gateway refund did not succeed."),
                    new Dictionary<string, string>
                    {
                        ["bookingId"] = booking.Id.ToString(),
                        ["pnr"] = booking.Pnr,
                        ["paymentId"] = paidPayment.Id.ToString(),
                    },
                    ct);
            }
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Customer cancelled booking {Pnr} (paid={Paid})", booking.Pnr, paidPayment is not null);
        return await ToViewAsync(booking, ct);
    }

    /// <summary>Who may ask, and why not. A Confirmed booking can always request (ops path). A Pending booking can cancel
    /// the hold. Already cancelled / failed / rejected bookings cannot.</summary>
    internal static (bool Can, string? Reason) Evaluate(Booking booking, bool hasPaidPayment, CancellationRequest? latest)
    {
        if (latest is { Status: CancellationRequestStatus.Requested })
            return (false, "A cancellation request is already being reviewed.");
        if (latest is { Status: CancellationRequestStatus.Completed } || booking.Status == BookingStatus.Cancelled)
            return (false, "This booking is already cancelled.");
        if (booking.Status is BookingStatus.Failed or BookingStatus.RejectedCredit or BookingStatus.RejectedExpired)
            return (false, "This booking was not completed, so there is nothing to cancel.");
        if (booking.Status == BookingStatus.Confirmed)
            return (true, null);
        if (booking.Status == BookingStatus.Pending)
            return (true, null);
        return (false, "This booking cannot be cancelled.");
    }

    private async Task ReleaseHoldsAsync(Booking booking, CancellationToken ct)
    {
        foreach (var hold in BookingLegs.Read(booking))
        {
            try { await suppliers.CancelHoldAsync(hold.SupplierCode, hold.SupplierPnrId, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Supplier cancel failed for booking {Pnr} hold {SupplierPnr}", booking.Pnr, hold.SupplierPnrId);
            }
        }
    }

    public async Task<AdminCancellationList> ListForAdminAsync(string? status, string? channel, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.CancellationRequests.AsNoTracking();
        if (!string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            var parsed = Enum.TryParse<CancellationRequestStatus>(status, ignoreCase: true, out var chosen)
                ? chosen
                : CancellationRequestStatus.Requested;
            query = query.Where(c => c.Status == parsed);
        }

        var channelFilter = string.IsNullOrWhiteSpace(channel) ? null : channel.Trim();
        if (channelFilter is not null)
            query = query.Where(c => db.Bookings.Any(b => b.Id == c.BookingId && b.Channel == channelFilter));

        var total = await query.CountAsync(ct);
        var requests = await query
            .OrderBy(c => c.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var bookingIds = requests.Select(c => c.BookingId).ToList();
        var bookings = await db.Bookings.AsNoTracking().Where(b => bookingIds.Contains(b.Id)).ToDictionaryAsync(b => b.Id, ct);
        var payments = await db.Payments.AsNoTracking().Where(p => bookingIds.Contains(p.BookingId)).ToListAsync(ct);
        var refundIds = requests.Where(c => c.RefundId is not null).Select(c => c.RefundId!.Value).ToList();
        var refunds = await db.Refunds.AsNoTracking().Where(r => refundIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, ct);

        var items = requests.Select(c =>
        {
            bookings.TryGetValue(c.BookingId, out var booking);
            return ToAdminItem(c, booking, LatestPayment(payments, c.BookingId), c.RefundId is { } rid && refunds.TryGetValue(rid, out var refund) ? refund : null);
        }).ToList();

        return new AdminCancellationList(items, total, page, pageSize);
    }

    public async Task<AdminCancellationItem> CompleteForAdminAsync(Guid requestId, string? opsNote, CancellationToken ct)
    {
        var request = await db.CancellationRequests.FirstOrDefaultAsync(c => c.Id == requestId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Cancellation request not found.", "cancellation_request_not_found");
        var booking = await db.Bookings.FirstOrDefaultAsync(b => b.Id == request.BookingId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Cancellation request not found.", "cancellation_request_not_found");

        if (request.Status == CancellationRequestStatus.Completed)
            return await AdminItemAsync(request, booking, ct);

        if (request.Status != CancellationRequestStatus.Requested)
            throw new ServiceException(ErrorKind.FailedPrecondition, "This request is no longer open.", "cancel_not_open");

        var note = NormalizeOpsNote(opsNote);
        var paid = await db.Payments
            .Where(p => p.BookingId == booking.Id && p.Status == PaymentStatus.Paid)
            .OrderByDescending(p => p.PaidAt)
            .FirstOrDefaultAsync(ct);

        Refund? refund = null;
        if (paid is not null)
        {
            refund = await RefundPaidAsync(paid, "ops_cancel", "Platform admin completed a cancellation after the airline void.", ct);
            if (refund is null || refund.Status != RefundStatus.Succeeded)
            {
                await alerts.NotifyAsync(
                    $"Cancel refund failed for booking {booking.Pnr}",
                    new CancellationRequestException($"Ops completed cancel for {booking.Pnr} but the gateway refund did not succeed."),
                    new Dictionary<string, string>
                    {
                        ["bookingId"] = booking.Id.ToString(),
                        ["pnr"] = booking.Pnr,
                        ["requestId"] = request.Id.ToString(),
                        ["paymentId"] = paid.Id.ToString(),
                    },
                    ct);
                throw new ServiceException(ErrorKind.FailedPrecondition, "The refund did not succeed. The request is still open.", "refund_failed");
            }
        }

        booking.Status = BookingStatus.Cancelled;
        booking.UpdatedAt = DateTimeOffset.UtcNow;
        request.Status = CancellationRequestStatus.Completed;
        request.ResolvedAt = DateTimeOffset.UtcNow;
        request.UpdatedAt = DateTimeOffset.UtcNow;
        request.OpsNote = note ?? request.OpsNote;
        request.RefundId = refund?.Id ?? request.RefundId;
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Admin completed cancel request {RequestId} for booking {Pnr} (refunded={Refunded})",
            request.Id, booking.Pnr, refund is not null);
        return await AdminItemAsync(request, booking, ct);
    }

    public async Task<AdminCancellationItem> RejectForAdminAsync(Guid requestId, string? opsNote, CancellationToken ct)
    {
        var request = await db.CancellationRequests.FirstOrDefaultAsync(c => c.Id == requestId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Cancellation request not found.", "cancellation_request_not_found");
        var booking = await db.Bookings.FirstOrDefaultAsync(b => b.Id == request.BookingId, ct)
            ?? throw new ServiceException(ErrorKind.NotFound, "Cancellation request not found.", "cancellation_request_not_found");

        if (request.Status == CancellationRequestStatus.Rejected)
            return await AdminItemAsync(request, booking, ct);
        if (request.Status != CancellationRequestStatus.Requested)
            throw new ServiceException(ErrorKind.FailedPrecondition, "This request is no longer open.", "cancel_not_open");

        var note = NormalizeOpsNote(opsNote)
            ?? throw new ServiceException(ErrorKind.InvalidArgument, "A reason is required.", "ops_note_required");

        request.Status = CancellationRequestStatus.Rejected;
        request.OpsNote = note;
        request.ResolvedAt = DateTimeOffset.UtcNow;
        request.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Admin rejected cancel request {RequestId} for booking {Pnr}", request.Id, booking.Pnr);
        return await AdminItemAsync(request, booking, ct);
    }

    private async Task<AdminCancellationItem> AdminItemAsync(CancellationRequest request, Booking booking, CancellationToken ct)
    {
        var payments = await db.Payments.AsNoTracking().Where(p => p.BookingId == booking.Id).ToListAsync(ct);
        var payment = LatestPayment(payments, booking.Id);
        Refund? refund = null;
        if (request.RefundId is { } refundId)
            refund = await db.Refunds.AsNoTracking().FirstOrDefaultAsync(r => r.Id == refundId, ct);
        return ToAdminItem(request, booking, payment, refund);
    }

    private static AdminCancellationItem ToAdminItem(CancellationRequest request, Booking? booking, Payment? payment, Refund? refund)
    {
        var travelers = booking is null ? [] : TravelerNames(booking);
        return new AdminCancellationItem(
            request.Id,
            request.BookingId,
            booking?.Pnr ?? "",
            booking?.Channel ?? "",
            booking?.Status.ToString() ?? "",
            booking?.CustomerEmail ?? booking?.GuestEmail,
            booking?.FinalPrice ?? 0m,
            booking?.Currency ?? "",
            request.CustomerNote,
            request.OpsNote,
            request.Status.ToString(),
            request.CreatedAt,
            request.ResolvedAt,
            booking?.SupplierPnrId,
            booking?.SupplierCode ?? "",
            booking is null ? null : RouteSummary(booking),
            travelers,
            payment?.Status.ToString(),
            request.RefundId,
            refund?.Status.ToString());
    }

    private static Payment? LatestPayment(IReadOnlyList<Payment> payments, Guid bookingId) =>
        payments.Where(p => p.BookingId == bookingId)
            .OrderByDescending(p => p.Status == PaymentStatus.Paid)
            .ThenByDescending(p => p.CreatedAt)
            .FirstOrDefault();

    private static string? NormalizeOpsNote(string? note)
    {
        if (string.IsNullOrWhiteSpace(note)) return null;
        var trimmed = note.Trim();
        return trimmed.Length <= 500 ? trimmed : trimmed[..500];
    }

    private static IReadOnlyList<string> TravelerNames(Booking booking)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrEmpty(booking.TravelersJson) ? "[]" : booking.TravelersJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return [];
            var names = new List<string>();
            foreach (var traveler in doc.RootElement.EnumerateArray())
            {
                var first = JsonString(traveler, "FirstName");
                var last = JsonString(traveler, "LastName");
                var name = $"{first} {last}".Trim();
                if (name.Length > 0) names.Add(name);
            }
            return names;
        }
        catch (JsonException) { return []; }
    }

    private static string? RouteSummary(Booking booking)
    {
        if (string.IsNullOrEmpty(booking.ItineraryJson)) return null;
        try
        {
            var trip = JsonSerializer.Deserialize<OfferSnapshot>(booking.ItineraryJson);
            if (trip is null || trip.Segments.Count == 0) return null;
            return string.Join(" · ", trip.Segments.Select(s => $"{s.Origin}→{s.Destination}"));
        }
        catch (JsonException) { return null; }
    }

    private static string JsonString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";

    private async Task<Refund?> RefundPaidAsync(Payment payment, string reasonCode, string remarks, CancellationToken ct)
    {
        var existingOk = await db.Refunds.AnyAsync(r => r.PaymentId == payment.Id && r.Status == RefundStatus.Succeeded, ct);
        if (existingOk || payment.Status == PaymentStatus.Refunded)
        {
            payment.Status = PaymentStatus.Refunded;
            payment.UpdatedAt = DateTimeOffset.UtcNow;
            return await db.Refunds.Where(r => r.PaymentId == payment.Id && r.Status == RefundStatus.Succeeded).FirstOrDefaultAsync(ct);
        }

        var refund = new Refund
        {
            TenantId = payment.TenantId,
            PaymentId = payment.Id,
            Amount = payment.Amount,
            Currency = payment.Currency,
            Status = RefundStatus.Pending,
            Reason = reasonCode.Length <= 200 ? reasonCode : reasonCode[..200],
        };
        db.Refunds.Add(refund);
        await db.SaveChangesAsync(ct);

        if (payment.Gateway == PaymentGateways.Wallet)
        {
            var owner = await db.Bookings.AsNoTracking().Where(b => b.Id == payment.BookingId).Select(b => b.CustomerId).FirstOrDefaultAsync(ct);
            if (owner is { } customerId)
                await wallets.CreditAsync(payment.TenantId, customerId, payment.Amount, payment.Currency, payment.BookingId, remarks, ct);
            refund.Status = RefundStatus.Succeeded;
            refund.GatewayRef = "wallet";
            refund.UpdatedAt = DateTimeOffset.UtcNow;
            payment.Status = PaymentStatus.Refunded;
            payment.UpdatedAt = DateTimeOffset.UtcNow;
            return refund;
        }

        if (string.IsNullOrWhiteSpace(payment.GatewayRef))
        {
            logger.LogError("Cannot refund payment {PaymentId}: missing GatewayRef", payment.Id);
            refund.Status = RefundStatus.Failed;
            refund.UpdatedAt = DateTimeOffset.UtcNow;
            return refund;
        }

        var refundTranId = refund.Id.ToString("N")[..24];
        try
        {
            var result = await gateway.RefundAsync(new GatewayRefundRequest(
                BankTranId: payment.GatewayRef,
                RefundTranId: refundTranId,
                Amount: payment.Amount,
                Remarks: remarks), ct);
            if (result.Ok)
            {
                refund.Status = RefundStatus.Succeeded;
                refund.GatewayRef = result.GatewayRef;
                payment.Status = PaymentStatus.Refunded;
                payment.UpdatedAt = DateTimeOffset.UtcNow;
            }
            else
            {
                refund.Status = RefundStatus.Failed;
                refund.GatewayRef = result.GatewayRef;
                logger.LogError("Gateway refund failed for payment {PaymentId}: {Status} {Error}", payment.Id, result.Status, result.ErrorReason);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Gateway refund threw for payment {PaymentId}", payment.Id);
            refund.Status = RefundStatus.Failed;
        }

        refund.UpdatedAt = DateTimeOffset.UtcNow;
        return refund;
    }
}

public sealed class CancellationRequestException(string message) : Exception(message);
