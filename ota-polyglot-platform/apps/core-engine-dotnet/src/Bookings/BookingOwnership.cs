using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Bookings;

/// <summary>The SQL form of <see cref="BookingAccess"/>: narrow a bookings query to what the caller may see or act on, so
/// an unauthorised booking is never even loaded (and is answered exactly like one that does not exist). Any code that reads
/// bookings on a caller's behalf should start from one of these, not from db.Bookings.</summary>
public static class BookingOwnership
{
    public static IQueryable<Booking> VisibleTo(this IQueryable<Booking> bookings, Caller caller)
    {
        if (caller.ActorType == ActorTypes.Agent && caller.IsPlatformAdmin) return bookings;
        if (caller.ActorType == ActorTypes.Agent && caller.AgentId is { } agent)
            return bookings.Where(b => b.AgentId == agent || b.SubAgentId == agent);
        if (caller.ActorType == ActorTypes.Customer && caller.CustomerId is { } customer)
            return bookings.Where(b => b.CustomerId == customer);
        if (caller.ActorType == ActorTypes.Guest && caller.GuestBookingId is { } granted)
            return bookings.Where(b => b.Id == granted);
        return bookings.Where(_ => false);
    }

    public static IQueryable<Booking> ControlledBy(this IQueryable<Booking> bookings, Caller caller)
    {
        if (caller.ActorType == ActorTypes.Agent && !caller.IsPlatformAdmin && caller.AgentId is { } agent)
            return bookings.Where(b => b.AgentId == agent);
        if (caller.ActorType == ActorTypes.Customer && caller.CustomerId is { } customer)
            return bookings.Where(b => b.CustomerId == customer);
        if (caller.ActorType == ActorTypes.Guest && caller.GuestBookingId is { } granted)
            return bookings.Where(b => b.Id == granted);
        return bookings.Where(_ => false);
    }

    public static BookingOwner Owner(this Booking b) => new(b.AgentId, b.SubAgentId, b.CustomerId, b.Id);
}
