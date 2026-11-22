using Grpc.Core;
using Microsoft.AspNetCore.Authorization;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Search;
using GrpcContract = Ota.CoreEngine.Grpc;

namespace Ota.CoreEngine.Grpc;

/// <summary>
/// The gRPC surface — an adapter and nothing more. Each RPC authenticates the call (a policy per RPC, see
/// GrpcAuth), turns the credential into a Caller (GrpcCallerResolver), and hands it to the application service
/// that owns the logic. Business failures reach the client as status codes through ServiceExceptionInterceptor.
/// A new RPC without an explicit [Authorize] policy fails the build (GrpcAuthTests).
///
/// Booking is a two-phase pipeline: ProcessB2BBooking reserves the PNR (Pending, no debit); IssueTicket pays,
/// tickets and confirms — see BookingService.
/// </summary>
public sealed class OtaCoreGrpcService(
    IGrpcCallerResolver callers,
    ISearchService search,
    IBookingService bookings)
    : GrpcContract.OtaCoreService.OtaCoreServiceBase
{
    [Authorize(AuthenticationSchemes = GrpcAuth.Scheme, Policy = GrpcAuth.Policies.Search)]
    public override Task<GrpcContract.SearchResponse> GetSupplierAvailability(
        GrpcContract.SearchRequest request, ServerCallContext context) =>
        search.SearchAsync(callers.Resolve(request.Tenant, context), request, context.CancellationToken);

    [Authorize(AuthenticationSchemes = GrpcAuth.Scheme, Policy = GrpcAuth.Policies.Revalidate)]
    public override Task<GrpcContract.RevalidateResponse> RevalidateOffer(
        GrpcContract.RevalidateRequest request, ServerCallContext context) =>
        search.RevalidateAsync(callers.Resolve(request.Tenant, context), request, context.CancellationToken);

    [Authorize(AuthenticationSchemes = GrpcAuth.Scheme, Policy = GrpcAuth.Policies.Agent)]
    public override Task<GrpcContract.BookingConfirmation> ProcessB2BBooking(
        GrpcContract.B2BBookingRequest request, ServerCallContext context) =>
        bookings.ReserveAsync(callers.Resolve(request.Tenant, context), request, context.CancellationToken);

    [Authorize(AuthenticationSchemes = GrpcAuth.Scheme, Policy = GrpcAuth.Policies.Agent)]
    public override Task<GrpcContract.BookingConfirmation> IssueTicket(
        GrpcContract.IssueTicketRequest request, ServerCallContext context) =>
        bookings.IssueTicketAsync(callers.Resolve(request.Tenant, context), request, context.CancellationToken);
}
