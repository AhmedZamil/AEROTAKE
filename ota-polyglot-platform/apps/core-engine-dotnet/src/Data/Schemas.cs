using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Data;

/// <summary>The database schema each module's tables live in. The names follow the module layout in the plan (section 4.1); tenancy is
/// its own schema because the tenant registry is used by every module and owned by none of them. Anything not listed is global
/// reference data and stays in the default schema. Raw SQL must name the schema (see AgentCreditService, CustomerSessions, and the
/// ai-engine outbox poller, whose queries are checked against the real database by OutboxPollerContractTests).</summary>
public static class Schemas
{
    public const string IdentityAgents = "identity_agents";
    public const string IdentityCustomers = "identity_customers";
    public const string Pricing = "pricing";
    public const string Ledger = "ledger";
    public const string Booking = "booking";
    public const string Messaging = "messaging";
    public const string Tenancy = "tenancy";
    public const string Payments = "payments";

    public static readonly IReadOnlyDictionary<Type, string> OwnerOf = new Dictionary<Type, string>
    {
        [typeof(Agent)] = IdentityAgents,
        [typeof(User)] = IdentityAgents,
        [typeof(UserDevice)] = IdentityAgents,
        [typeof(VerificationCode)] = IdentityAgents,
        [typeof(Customer)] = IdentityCustomers,
        [typeof(CustomerIdentity)] = IdentityCustomers,
        [typeof(GuestClaimToken)] = IdentityCustomers,
        [typeof(CustomerEmailToken)] = IdentityCustomers,
        [typeof(RevokedToken)] = IdentityCustomers,
        [typeof(MarkupRule)] = Pricing,
        [typeof(AgentTierProfile)] = Pricing,
        [typeof(ExchangeRate)] = Pricing,
        [typeof(LedgerEntry)] = Ledger,
        [typeof(Domain.Booking)] = Booking,
        [typeof(CancellationRequest)] = Booking,
        [typeof(OutboxEvent)] = Messaging,
        [typeof(Tenant)] = Tenancy,
        [typeof(TenantDomain)] = Tenancy,
        [typeof(Payment)] = Payments,
        [typeof(PaymentAttempt)] = Payments,
        [typeof(Refund)] = Payments,
        [typeof(CustomerWallet)] = Payments,
        [typeof(WalletEntry)] = Payments,
        [typeof(WalletTopUp)] = Payments,
    };
}
