namespace Ota.CoreEngine.Domain;

/// <summary>
/// Every row-level entity in the platform is tenant-scoped. A global EF Core
/// query filter (see <see cref="Data.OtaDbContext"/>) guarantees isolation.
/// </summary>
public abstract class TenantScopedEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TenantId { get; set; } = default!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAt { get; set; }
}

public enum AgentTier { Standard = 1, Silver = 2, Gold = 3, Platinum = 4 }

public enum BookingStatus
{
    Pending = 0,
    Confirmed = 1,
    RejectedCredit = 2,
    RejectedExpired = 3,
    Cancelled = 4,
    Failed = 5
}

public enum LedgerEntryType { CreditTopUp = 1, BookingDebit = 2, RefundCredit = 3, Adjustment = 4 }

public enum UserRole { Admin = 1, AgencyAdmin = 2, AgencyUser = 3 }

public enum VerificationPurpose { DeviceVerification = 1, PasswordReset = 2 }

/// <summary>B2B agency (or white-label owner) account with a credit ledger.</summary>
public class Agent : TenantScopedEntity
{
    public string DisplayName { get; set; } = default!;
    public string Email { get; set; } = default!;
    public AgentTier Tier { get; set; } = AgentTier.Standard;
    public bool IsActive { get; set; } = true;

    /// <summary>Maximum exposure allowed (in tenant base currency).</summary>
    public decimal CreditLimit { get; set; }

    /// <summary>Currently consumed credit. AvailableCredit = CreditLimit - CreditUsed.</summary>
    public decimal CreditUsed { get; set; }

    public decimal AvailableCredit => CreditLimit - CreditUsed;

    public Guid? ParentAgentId { get; set; }      // Set for sub-agents
    public Agent? ParentAgent { get; set; }

    /// <summary>Optimistic concurrency token — prevents double-spend on the ledger.</summary>
    public uint Version { get; set; }

    public ICollection<LedgerEntry> LedgerEntries { get; set; } = new List<LedgerEntry>();
}

/// <summary>Immutable double-entry style ledger line for agent credit movement.</summary>
public class LedgerEntry : TenantScopedEntity
{
    public Guid AgentId { get; set; }
    public Agent Agent { get; set; } = default!;
    public LedgerEntryType Type { get; set; }
    public decimal Amount { get; set; }           // Positive numbers; Type carries direction
    public decimal BalanceAfter { get; set; }
    public Guid? BookingId { get; set; }
    public string Reference { get; set; } = default!;
}

/// <summary>Which pricing scheme a markup rule belongs to. Kept in step with CK_MarkupRules_ChannelTier.</summary>
public static class MarkupChannels
{
    /// <summary>Agent pricing: one rule per agent tier (the original scheme; also prices white-label domains).</summary>
    public const string B2BAgent = "B2B_AGENT";

    /// <summary>Consumer pricing: one rule per product for the tenant, with no tier — a consumer has no agency tier.</summary>
    public const string B2C = "B2C";

    /// <summary>The scheme that prices a caller: consumer channel -> B2C, everything else -> agent rules by tier.</summary>
    public static string For(string callerChannel) => callerChannel == BookingChannels.B2C ? B2C : B2BAgent;
}

/// <summary>Markup rules configured per tenant, per pricing scheme (<see cref="MarkupChannels"/>) and optionally
/// per product. Agent rules are keyed by tier; consumer rules have no tier.</summary>
public class MarkupRule : TenantScopedEntity
{
    /// <summary>B2B_AGENT | B2C. Defaults to agent pricing, which is what every rule meant before B2C existed.</summary>
    public string Channel { get; set; } = MarkupChannels.B2BAgent;

    /// <summary>Required for B2B_AGENT rules, null for B2C rules (CK_MarkupRules_ChannelTier).</summary>
    public AgentTier? Tier { get; set; }
    public string ProductType { get; set; } = "*"; // "*" = all products
    public decimal MarkupPercent { get; set; }     // 0.08m == 8%
    public decimal SubAgentDefaultMargin { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>Admin-editable metadata layered over one of the 4 fixed AgentTier
/// enum slots, per tenant. Does NOT replace the enum — Agent.Tier, MarkupRule.Tier,
/// and the gRPC contract all keep using AgentTier directly (changing that is a
/// breaking wire-protocol change, out of scope). One row per tenant per enum
/// value, enforced by a unique index in OtaDbContext.</summary>
public class AgentTierProfile : TenantScopedEntity
{
    public AgentTier Tier { get; set; }
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>The sales channel a booking was made through. Stored on the booking itself (not derived later) so
/// reports and access rules never have to guess. Kept in step with CK_Bookings_Channel.</summary>
public static class BookingChannels
{
    public const string B2BAgent = "B2B_AGENT";
    public const string B2BSubAgent = "B2B_SUB_AGENT";
    public const string WhiteLabel = "WHITE_LABEL";
    public const string B2C = "B2C";

    /// <summary>Channels whose bookings belong to an agent (and are paid from that agent's credit).</summary>
    public static readonly IReadOnlySet<string> AgentOwned = new HashSet<string> { B2BAgent, B2BSubAgent, WhiteLabel };
}

public class Booking : TenantScopedEntity
{
    /// <summary>B2B_AGENT | B2B_SUB_AGENT | WHITE_LABEL | B2C — see <see cref="BookingChannels"/>. Required: there is no
    /// database default, so a code path that forgets to say which channel it is fails loudly.</summary>
    public string Channel { get; set; } = default!;

    /// <summary>Who owns the booking. Agent-channel bookings have an AgentId and no CustomerId; B2C bookings have no
    /// AgentId and, once the customer is known, a CustomerId (a guest has neither — see GuestEmail). Enforced by
    /// CK_Bookings_Owner.</summary>
    public Guid? CustomerId { get; set; }

    /// <summary>Contact email of a guest (no account) B2C booking; how a guest finds the booking again.</summary>
    public string? GuestEmail { get; set; }

    public string Pnr { get; set; } = default!;
    public string OfferId { get; set; } = default!;
    public string SupplierCode { get; set; } = default!;
    public Guid? AgentId { get; set; }
    public Guid? SubAgentId { get; set; }
    public string? CustomerEmail { get; set; }
    public BookingStatus Status { get; set; } = BookingStatus.Pending;

    public decimal SupplierNetRate { get; set; }
    public decimal AgentMarkupPercent { get; set; }
    public decimal SubAgentMargin { get; set; }
    public decimal FinalPrice { get; set; }
    public string Currency { get; set; } = "USD";

    public string IdempotencyKey { get; set; } = default!;
    public string TravelersJson { get; set; } = "[]";

    /// <summary>Supplier's reservation reference (Sabre ItineraryRef.ID) — set once
    /// ProcessB2BBooking reserves the PNR, before payment/ticketing.</summary>
    public string? SupplierPnrId { get; set; }

    /// <summary>Deadline by which IssueTicket must be called or the reservation lapses
    /// (AeroTake's ticketing_last_date).</summary>
    public DateTimeOffset? TicketingDeadline { get; set; }

    /// <summary>When the unpaid-hold reminder email was sent (P5-18). Null until the hold-reminder job emails once.</summary>
    public DateTimeOffset? HoldReminderSentAt { get; set; }

    /// <summary>The flight(s) this booking is for, as the customer was shown them (an <c>OfferSnapshot</c> serialised: itinerary,
    /// baggage, currency — never a price). Recorded for consumer bookings so "manage booking" can show the trip after the supplier's
    /// offer cache has expired; null on agent bookings, which predate it.</summary>
    public string? ItineraryJson { get; set; }

    /// <summary>Every supplier hold in this booking, when the trip is more than one offer (multi-city). Null on a
    /// single-offer booking, which keeps its one hold in <see cref="OfferId"/> / <see cref="SupplierPnrId"/>.</summary>
    public string? LegsJson { get; set; }
}

/// <summary>A person who can log in — platform admin or an agency's staff. Distinct from
/// Agent (the agency/tenant account itself); a User optionally belongs to one.</summary>
public class User : TenantScopedEntity
{
    public string Email { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;
    public string FirstName { get; set; } = default!;
    public string LastName { get; set; } = default!;
    public bool IsActive { get; set; } = true;
    public bool EmailVerified { get; set; }
    public UserRole Role { get; set; } = UserRole.AgencyUser;

    /// <summary>Null for platform admins; set for agency staff.</summary>
    public Guid? AgentId { get; set; }
    public Agent? Agent { get; set; }
}

/// <summary>A device that has already completed email-code verification for a user —
/// subsequent logins from the same device skip straight through (see
/// AeroTake's user_devices table / VerifyController flow, minus the hardcoded bypass).</summary>
public class UserDevice : TenantScopedEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public string DeviceToken { get; set; } = default!;
}

/// <summary>Single-use email codes for device verification and password reset.</summary>
public class VerificationCode : TenantScopedEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public string Code { get; set; } = default!;
    public VerificationPurpose Purpose { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
}

/// <summary>Transactional outbox row: written in the same SaveChangesAsync as the
/// domain change it announces, so an event can never be lost after that change
/// commits. ai-engine-python polls/LISTENs on this table directly via raw SQL —
/// see the migration comment on the table before renaming a column.</summary>
public class OutboxEvent : TenantScopedEntity
{
    public string Topic { get; set; } = default!;
    public string Key { get; set; } = default!;
    public string Payload { get; set; } = default!; // JSON
    public DateTimeOffset? ProcessedAt { get; set; }
    public int Attempts { get; set; }
}

/// <summary>Global airport reference data (IATA/ICAO directory) used to power the
/// search panel's From/To typeahead. Deliberately NOT a TenantScopedEntity — every
/// tenant sees the same airport directory, so there is no TenantId and no EF query
/// filter on this table (see OtaDbContext.OnModelCreating).</summary>
public class Airport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string IataCode { get; set; } = default!;
    public string? IcaoCode { get; set; }
    public string Name { get; set; } = default!;
    public string City { get; set; } = default!;
    public string Country { get; set; } = default!;
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
}

/// <summary>Global airline reference data (IATA directory) used to power the search
/// panel's "Preferred Airline" filter. Same rationale as Airport — no TenantId, no
/// query filter, every tenant sees the same directory.</summary>
public class Airline
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string IataCode { get; set; } = default!;
    public string Name { get; set; } = default!;
    public string? LogoUrl { get; set; }
}

/// <summary>An operating business/brand whose data is isolated from every other tenant
/// (the value every TenantScopedEntity.TenantId refers to). Control-plane data: global,
/// deliberately NOT a TenantScopedEntity and with no query filter — a tenant admin must
/// never be able to read or edit other tenants. Managed by scripts/provision-tenant.sh.</summary>
public class Tenant
{
    public string TenantId { get; set; } = default!;
    public string DisplayName { get; set; } = default!;

    /// <summary>ISO 4217 currency this tenant sells in. Prices are computed server-side
    /// in this currency; clients never convert. See <see cref="ExchangeRate"/> for supplier → sell FX.</summary>
    public string SellCurrency { get; set; } = "USD";

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<TenantDomain> Domains { get; set; } = new List<TenantDomain>();
}

/// <summary>A publishable FX rate: multiply an amount in <see cref="FromCurrency"/> by <see cref="Rate"/>
/// to get <see cref="ToCurrency"/> (rounded half-away-from-zero to 2dp at conversion time). Global reference
/// data in the pricing schema — not tenant-scoped. PlatformAdmin manages rows via
/// <c>/api/v1/exchange-rates</c>; the seeder only fills an empty table.</summary>
public class ExchangeRate
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>ISO 4217, stored uppercase.</summary>
    public string FromCurrency { get; set; } = default!;

    /// <summary>ISO 4217, stored uppercase.</summary>
    public string ToCurrency { get; set; } = default!;

    /// <summary>to = from × Rate. Precision enough for high-denomination pairs (e.g. USD→BDT ≈ 110).</summary>
    public decimal Rate { get; set; }

    public DateTimeOffset EffectiveFrom { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Null means still current. A new row for the same pair supersedes by a later EffectiveFrom.</summary>
    public DateTimeOffset? EffectiveTo { get; set; }

    /// <summary>Where the rate came from (e.g. "seed", "manual") — for audit, not for logic.</summary>
    public string Source { get; set; } = "seed";
}

/// <summary>A hostname served for a tenant, with the channel and branding shown on it.
/// One tenant can have several (e.g. a B2C storefront plus white-label agent domains).
/// Host is stored lowercase with no port; see CK_TenantDomains_HostLowercase.</summary>
public class TenantDomain
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Host { get; set; } = default!;
    public string TenantId { get; set; } = default!;
    public Tenant Tenant { get; set; } = default!;

    /// <summary>B2C | B2B_AGENT | B2B_SUB_AGENT | WHITE_LABEL (CK_TenantDomains_Channel).</summary>
    public string Channel { get; set; } = default!;

    /// <summary>The agency a white-label domain trades as. Interim: the frontend still forwards
    /// it to gRPC until the token carries it (P0-11/P0-13). Not a foreign key — Agent is tenant-scoped.</summary>
    public Guid? AgentId { get; set; }

    public string BrandName { get; set; } = default!;
    public string LogoUrl { get; set; } = default!;
    public string PrimaryColor { get; set; } = default!;
    public string AccentColor { get; set; } = default!;
    public string MarkupProfile { get; set; } = default!;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A consumer (B2C) account. Belongs to exactly one tenant — the brand they signed up on — so the same
/// person on two brands is two customers. Deliberately separate from <see cref="User"/> (agency staff): different
/// onboarding, login, ownership and risk. There is no password: customers sign in through a provider
/// (<see cref="CustomerIdentity"/>).</summary>
public class Customer : TenantScopedEntity
{
    /// <summary>Lowercase, trimmed (CK_Customers_EmailLowercase); unique per tenant when present. Null is possible: a
    /// social account may not share an email, and we do not invent one.</summary>
    public string? Email { get; set; }

    /// <summary>True only when a provider vouched for the email or the customer confirmed it. Linking a second login to
    /// this customer by email is only allowed when this is true.</summary>
    public bool EmailVerified { get; set; }

    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>Set when the customer asked for erasure: personal fields are cleared and the row kept, so bookings and
    /// ledgers that point at it stay consistent.</summary>
    public DateTimeOffset? DeletedAt { get; set; }

    /// <summary>Every token issued to this customer BEFORE this instant is dead. Set by "sign out everywhere" (and available to
    /// suspension and account-security flows). Null means no such cut-off has ever been made.</summary>
    public DateTimeOffset? TokensValidAfter { get; set; }

    public ICollection<CustomerIdentity> Identities { get; set; } = new List<CustomerIdentity>();
}

/// <summary>One way a customer signs in: a provider account (Google, Facebook). A customer can have several; a provider
/// account belongs to at most one customer per tenant.</summary>
public class CustomerIdentity : TenantScopedEntity
{
    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = default!;

    /// <summary>google | facebook | password (CK_CustomerIdentities_Provider). "password" is the classic email-and-password login.</summary>
    public string Provider { get; set; } = default!;

    /// <summary>The provider's stable id for the account (Google "sub"), never the email.</summary>
    public string ProviderSubject { get; set; } = default!;

    /// <summary>What the provider told us at last sign-in; informational, and the basis for the linking rule.</summary>
    public string? Email { get; set; }
    public bool EmailVerified { get; set; }

    /// <summary>BCrypt hash; set only for the "password" provider (whose ProviderSubject is the normalised email), null otherwise
    /// (CK_CustomerIdentities_PasswordHash). Never returned by any endpoint.</summary>
    public string? PasswordHash { get; set; }
}

public static class IdentityProviders
{
    public const string Google = "google";
    public const string Facebook = "facebook";
    public const string Password = "password";
}

/// <summary>A single-use link sent to a customer's mailbox: to confirm the address ("verify") or to set a new password ("reset"). Only a
/// hash of the token is stored, so the table alone cannot be replayed as a credential.</summary>
public class CustomerEmailToken : TenantScopedEntity
{
    public Guid CustomerId { get; set; }
    public string Purpose { get; set; } = default!; // verify | reset
    public string TokenHash { get; set; } = default!;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
}

public static class EmailTokenPurposes
{
    public const string Verify = "verify";
    public const string Reset = "reset";
}

/// <summary>Lets a guest (no account) come back to one booking through an emailed link. Only a hash of the token is
/// stored, so the table alone cannot be replayed as a credential.</summary>
public class GuestClaimToken : TenantScopedEntity
{
    public Guid BookingId { get; set; }

    /// <summary>Lowercase hex SHA-256 of the random token that was emailed.</summary>
    public string TokenHash { get; set; } = default!;

    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
}

/// <summary>A token or session that must no longer be honoured, kept until it would have expired anyway. Durable on purpose: an
/// in-memory or cache store can lose or evict an entry, and a lost revocation silently resurrects a stolen token. Two kinds of id
/// live here — a refresh token's jti ("used" or logged out) and a session ("sid:{id}", ended by sign-out). Not tenant-scoped: ids
/// are globally unique random values.</summary>
public class RevokedToken
{
    public string TokenId { get; set; } = default!;
    public DateTimeOffset RevokedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>When the token (or session's longest-lived token) would have expired; the row is worthless after that and is cleaned up.</summary>
    public DateTimeOffset ExpiresAt { get; set; }
}

/// <summary>B2C payment against a booking (SSLCommerz first; more gateways behind <c>IPaymentGateway</c>). Separate from the agent ledger.</summary>
public class Payment : TenantScopedEntity
{
    public Guid BookingId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "BDT";
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public string Gateway { get; set; } = PaymentGateways.SslCommerz;
    /// <summary>Our merchant transaction id sent to the gateway (unique per store).</summary>
    public string TranId { get; set; } = default!;
    /// <summary>Gateway session / bank transaction reference once known.</summary>
    public string? GatewayRef { get; set; }
    public DateTimeOffset? PaidAt { get; set; }
}

public class PaymentAttempt : TenantScopedEntity
{
    public Guid PaymentId { get; set; }
    public string IdempotencyKey { get; set; } = default!;
    public PaymentAttemptStatus Status { get; set; } = PaymentAttemptStatus.Created;
    public string? SessionKey { get; set; }
    public string? GatewayPageUrl { get; set; }
    public string? FailureReason { get; set; }
    /// <summary>Raw IPN / redirect payload (JSON), stored before processing for replay safety (P4-4).</summary>
    public string? GatewayEventJson { get; set; }
}

public class Refund : TenantScopedEntity
{
    public Guid PaymentId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "BDT";
    public RefundStatus Status { get; set; } = RefundStatus.Pending;
    public string? GatewayRef { get; set; }
    public string? Reason { get; set; }
}

public enum PaymentStatus { Pending = 0, Initiated = 1, Paid = 2, Failed = 3, Refunded = 4, PartiallyRefunded = 5 }
public enum PaymentAttemptStatus { Created = 0, Redirected = 1, Succeeded = 2, Failed = 3, Cancelled = 4 }
public enum RefundStatus { Pending = 0, Succeeded = 1, Failed = 2 }

/// <summary>P5-20: a customer (or manage-booking claimant) asked to cancel after payment / while a hold is still open.</summary>
public enum CancellationRequestStatus
{
    /// <summary>Stored for ops — typically a Confirmed ticket that cannot be auto-refunded yet.</summary>
    Requested = 0,
    /// <summary>Booking cancelled; a gateway refund was started when money had been taken.</summary>
    Completed = 1,
    /// <summary>Ops rejected the request (booking stays as it was).</summary>
    Rejected = 2,
}

/// <summary>One cancel/refund ask against a B2C booking. At most one open <see cref="CancellationRequestStatus.Requested"/> row per booking.</summary>
public class CancellationRequest : TenantScopedEntity
{
    public Guid BookingId { get; set; }
    public CancellationRequestStatus Status { get; set; } = CancellationRequestStatus.Requested;
    /// <summary>Optional note from the customer (never shown as a supplier reason).</summary>
    public string? CustomerNote { get; set; }
    /// <summary>Note from the platform admin who completed or rejected the request. Never sent on the customer booking view.</summary>
    public string? OpsNote { get; set; }
    public Guid? RefundId { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
}

public static class PaymentGateways
{
    public const string SslCommerz = "sslcommerz";
    /// <summary>The customer's own Aerotake balance. Not a card gateway.</summary>
    public const string Wallet = "wallet";
}

/// <summary>One balance per customer per company. Currency is fixed on the first credit.</summary>
public class CustomerWallet : TenantScopedEntity
{
    public Guid CustomerId { get; set; }
    public decimal Balance { get; set; }
    public string Currency { get; set; } = "BDT";
}

/// <summary>A card payment that adds money to a <see cref="CustomerWallet"/>. The balance changes only after the gateway confirms it.</summary>
public class WalletTopUp : TenantScopedEntity
{
    public Guid CustomerId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "BDT";
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public string Gateway { get; set; } = PaymentGateways.SslCommerz;
    public string TranId { get; set; } = default!;
    public string? GatewayRef { get; set; }
    public string? GatewayPageUrl { get; set; }
    public string IdempotencyKey { get; set; } = default!;
    public DateTimeOffset? PaidAt { get; set; }
}

/// <summary>A credit or debit that moved a <see cref="CustomerWallet"/>. Amount is always positive; <see cref="Kind"/> says which way.</summary>
public class WalletEntry : TenantScopedEntity
{
    public Guid CustomerId { get; set; }
    public decimal Amount { get; set; }
    /// <summary>credit | debit</summary>
    public string Kind { get; set; } = "credit";
    public decimal BalanceAfter { get; set; }
    public Guid? BookingId { get; set; }
    public string? Note { get; set; }
}
