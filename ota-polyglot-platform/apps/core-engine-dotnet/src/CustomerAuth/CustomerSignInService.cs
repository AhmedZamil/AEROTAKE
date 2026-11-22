using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.CustomerAuth;

public sealed record CustomerSignIn(Customer Customer, bool IsNewCustomer);

/// <summary>Finds or creates the customer behind a verified provider identity. The rules that keep accounts safe:
///
///  * A customer belongs to ONE tenant (the brand they signed up on); the same provider account on two brands is two customers.
///  * A returning provider account always resolves to the same customer.
///  * A NEW provider account joins an EXISTING customer only through an email both sides have verified — the provider says it
///    verified the address, and the customer's address was verified when it was recorded. An unverified email is never a
///    reason to link: otherwise anyone who can register a provider account with a victim's address could take over their account.
///  * When an address is taken by a customer we may not link to, the new customer is created WITHOUT that email rather than
///    stealing or duplicating it; it can be confirmed later (magic link).
///  * A suspended or erased customer cannot sign in, and cannot be linked into.
///  * Two simultaneous first sign-ins for one provider account produce exactly one customer.</summary>
public interface ICustomerSignInService
{
    Task<CustomerSignIn> SignInAsync(string tenantId, ExternalIdentity identity, CancellationToken ct);
}

public sealed class CustomerSignInService(OtaDbContext db, ITenantAccessor tenantAccessor, ILogger<CustomerSignInService> logger) : ICustomerSignInService
{
    public async Task<CustomerSignIn> SignInAsync(string tenantId, ExternalIdentity identity, CancellationToken ct)
    {
        // Every query below relies on the tenant query filter, so it must be the tenant we were asked about.
        if (tenantAccessor.Current?.TenantId != tenantId)
            throw new InvalidOperationException("The ambient tenant does not match the tenant being signed in to.");

        try
        {
            return await SignInOnceAsync(tenantId, identity, ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            // A concurrent first sign-in won the race to create this customer or identity. Start over: it now exists, and
            // this attempt resolves to it instead of creating a second one.
            db.ChangeTracker.Clear();
            logger.LogInformation("Customer sign-in raced with another for the same provider account; resolving the winner.");
            return await SignInOnceAsync(tenantId, identity, ct);
        }
    }

    private async Task<CustomerSignIn> SignInOnceAsync(string tenantId, ExternalIdentity id, CancellationToken ct)
    {
        var email = id.EmailVerified ? Normalize(id.Email) : null;

        var existingIdentity = await db.CustomerIdentities.Include(i => i.Customer)
            .FirstOrDefaultAsync(i => i.Provider == id.Provider && i.ProviderSubject == id.Subject, ct);

        if (existingIdentity is not null)
        {
            EnsureUsable(existingIdentity.Customer);
            existingIdentity.Email = Normalize(id.Email);
            existingIdentity.EmailVerified = id.EmailVerified;
            await db.SaveChangesAsync(ct);
            return new CustomerSignIn(existingIdentity.Customer, IsNewCustomer: false);
        }

        // New provider account: link only through a mutually verified email.
        Customer? customer = null;
        var isNew = false;
        if (email is not null)
        {
            var sameEmail = await db.Customers.FirstOrDefaultAsync(c => c.Email == email, ct);
            if (sameEmail is not null)
            {
                EnsureUsable(sameEmail);
                if (sameEmail.EmailVerified) customer = sameEmail;
                // else: the address belongs to a customer who never verified it — do not link, and do not take it either.
            }
        }

        if (customer is null)
        {
            var takenBySomeoneUnverified = email is not null && await db.Customers.AnyAsync(c => c.Email == email, ct);
            customer = new Customer
            {
                TenantId = tenantId,
                Email = takenBySomeoneUnverified ? null : email,
                EmailVerified = email is not null && !takenBySomeoneUnverified,
                FirstName = id.GivenName,
                LastName = id.FamilyName,
            };
            db.Customers.Add(customer);
            isNew = true;
        }

        db.CustomerIdentities.Add(new CustomerIdentity
        {
            TenantId = tenantId,
            Customer = customer,
            Provider = id.Provider,
            ProviderSubject = id.Subject,
            Email = Normalize(id.Email),
            EmailVerified = id.EmailVerified,
        });
        await db.SaveChangesAsync(ct);
        return new CustomerSignIn(customer, isNew);
    }

    private static void EnsureUsable(Customer customer)
    {
        if (!customer.IsActive || customer.DeletedAt is not null)
            throw new ServiceException(ErrorKind.PermissionDenied, "This account is not available.");
    }

    /// <summary>The form emails are stored in (CK_Customers_EmailLowercase).</summary>
    internal static string? Normalize(string? email) => string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    private static bool IsUniqueViolation(DbUpdateException ex) =>
        (ex.InnerException as Npgsql.PostgresException)?.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation;
}
