namespace Ota.CoreEngine.SharedKernel;

/// <summary>Who a booking belongs to — the only facts the access rules need, so the rules can be expressed (and tested)
/// without loading the booking entity.</summary>
public readonly record struct BookingOwner(Guid? AgentId, Guid? SubAgentId, Guid? CustomerId, Guid? Id = null);

/// <summary>Who may see and who may act on a booking. One definition, used by the services; the SQL form of the same rules
/// is Bookings.BookingOwnership, and tests keep the two — and the REST controllers' older check — from drifting apart.
///
/// Two levels, because seeing a booking and acting on it are not the same:
///   READ    the owning agency, the sub-agent it was made for, the customer it belongs to, or a platform admin.
///   CONTROL the owning agency or the customer only (ticketing, and later cancelling). A sub-agent may see a booking made
///           for them but not ticket it, and a platform admin has no agency to pay from, so cannot act on one.
/// A GUEST (no account) can READ exactly the one booking they have proven access to — by an emailed claim token, or by
/// reference and surname — and nothing else. CONTROL for a guest is the same one booking (P5-20 cancel); paying as a guest
/// is still via the B2C payment endpoints that resolve ownership themselves. Everyone else — another agency, another
/// customer, a service, an unidentified guest — gets nothing.
/// A caller in another TENANT never gets here: the tenant query filter removes the row first.</summary>
public static class BookingAccess
{
    public const string PlatformChannel = "PLATFORM";

    public static bool CanRead(Caller caller, BookingOwner booking) => caller.ActorType switch
    {
        ActorTypes.Agent when caller.IsPlatformAdmin => true,
        ActorTypes.Agent when caller.AgentId is { } agent => booking.AgentId == agent || booking.SubAgentId == agent,
        ActorTypes.Customer when caller.CustomerId is { } customer => booking.CustomerId == customer,
        ActorTypes.Guest when caller.GuestBookingId is { } granted => booking.Id == granted,
        _ => false,
    };

    public static bool CanControl(Caller caller, BookingOwner booking) => caller.ActorType switch
    {
        ActorTypes.Agent when !caller.IsPlatformAdmin && caller.AgentId is { } agent => booking.AgentId == agent,
        ActorTypes.Customer when caller.CustomerId is { } customer => booking.CustomerId == customer,
        ActorTypes.Guest when caller.GuestBookingId is { } granted => booking.Id == granted,
        _ => false,
    };
}
