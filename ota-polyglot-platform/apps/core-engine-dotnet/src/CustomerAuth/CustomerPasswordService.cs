using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.CustomerAuth;

public enum RegisterOutcome { Created, EmailTaken }

public sealed record PasswordRegistration(RegisterOutcome Outcome, Customer? Customer, string? VerifyToken);

/// <summary>Classic email-and-password accounts for consumers, next to Google/Facebook sign-in. The rules that keep them safe:
///
///  * Registering needs only a name, an email and a password, and works at once — but the email starts UNVERIFIED, and everything that trusts
///    an email needs it verified: linking a Google login to the account, and attaching earlier guest bookings. So nobody can register with
///    someone else's address and reach that person's bookings or take over their later Google sign-in.
///  * An address that already has an account cannot be registered again; the person is told to sign in or reset the password.
///  * Verifying the address (an emailed single-use link) makes it trusted. So does a password reset: it is the same proof of the mailbox.
///  * Wrong email and wrong password are indistinguishable (same answer, and the same time is spent), and a suspended or erased account looks the same.
///  * A password reset ends every session the customer has, so whoever was in the account is out.
///  * Tokens in emails are 256-bit, stored only as a hash, single-use, and short-lived.</summary>
public interface ICustomerPasswordService
{
    Task<PasswordRegistration> RegisterAsync(string tenantId, string email, string password, string? phone, string? firstName, string? lastName, CancellationToken ct);
    Task<Customer?> LoginAsync(string email, string password, CancellationToken ct);

    /// <summary>A fresh verify-your-email token for this customer (the raw value, once). Null if the customer has no email or it is already verified.</summary>
    Task<string?> IssueVerificationAsync(Customer customer, CancellationToken ct);

    /// <summary>Redeems a verify token. The customer whose address is now confirmed, or null if the token is unknown, used, or expired.</summary>
    Task<Customer?> VerifyEmailAsync(string? rawToken, CancellationToken ct);

    /// <summary>A reset token for the customer with this address, or null if there is none (the caller must answer the same either way).</summary>
    Task<(Customer Customer, string Token)?> StartResetAsync(string email, CancellationToken ct);

    /// <summary>Sets the password for the token's customer (creating the password login if they only had Google), confirms their email, and ends all their sessions.</summary>
    Task<Customer?> ResetPasswordAsync(string? rawToken, string newPassword, CancellationToken ct);

    /// <summary>Null if fine, otherwise what is wrong, in words the customer can act on.</summary>
    string? CheckPassword(string password, string? email);
}

public sealed class CustomerPasswordService(
    OtaDbContext db,
    ITenantAccessor tenantAccessor,
    IPasswordHasher hasher,
    ICustomerSessions sessions,
    ILogger<CustomerPasswordService> logger) : ICustomerPasswordService
{
    public const int MinPasswordLength = 8;
    public const int MaxPasswordBytes = 72; // BCrypt ignores anything past 72 bytes: refuse rather than silently truncate
    public static readonly TimeSpan VerifyLifetime = TimeSpan.FromHours(48);
    public static readonly TimeSpan ResetLifetime = TimeSpan.FromHours(1);

    // Compared against when no account matches, so "no such email" costs the same as "wrong password".
    private static string? _dummyHash;
    private string DummyHash => _dummyHash ??= hasher.Hash("not-a-real-password-for-timing");

    public string? CheckPassword(string password, string? email)
    {
        if (password.Length < MinPasswordLength) return $"Use at least {MinPasswordLength} characters.";
        if (Encoding.UTF8.GetByteCount(password) > MaxPasswordBytes) return "That password is too long (72 bytes at most).";
        if (email is not null && string.Equals(password.Trim(), email, StringComparison.OrdinalIgnoreCase)) return "The password must not be your email address.";
        if (CommonPasswords.IsCommon(password)) return "That password is too easy to guess. Try a few unrelated words, like a short sentence.";
        if (password.Trim().Length == 0) return "The password cannot be blank.";
        return null;
    }

    public async Task<PasswordRegistration> RegisterAsync(string tenantId, string email, string password, string? phone, string? firstName, string? lastName, CancellationToken ct)
    {
        EnsureTenant(tenantId);
        var normalized = Normalize(email) ?? throw new ServiceException(ErrorKind.InvalidArgument, "A valid email address is required.");
        string? cleanPhone = null;
        if (!string.IsNullOrWhiteSpace(phone))
            cleanPhone = NormalizePhone(phone) ?? throw new ServiceException(ErrorKind.InvalidArgument, "Enter a valid mobile number, or leave it blank.");
        if (CheckPassword(password, normalized) is { } weak) throw new ServiceException(ErrorKind.InvalidArgument, weak);
        if (firstName?.Length > 80 || lastName?.Length > 80) throw new ServiceException(ErrorKind.InvalidArgument, "A name is too long (80 characters at most).");

        if (await db.Customers.AnyAsync(c => c.Email == normalized, ct)) return new PasswordRegistration(RegisterOutcome.EmailTaken, null, null);

        var customer = new Customer { TenantId = tenantId, Email = normalized, EmailVerified = false, Phone = cleanPhone, FirstName = Clean(firstName), LastName = Clean(lastName) };
        db.Customers.Add(customer);
        db.CustomerIdentities.Add(new CustomerIdentity
        {
            TenantId = tenantId, Customer = customer, Provider = IdentityProviders.Password, ProviderSubject = normalized,
            Email = normalized, EmailVerified = false, PasswordHash = hasher.Hash(password),
        });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when ((ex.InnerException as Npgsql.PostgresException)?.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation)
        {
            db.ChangeTracker.Clear(); // two registrations for one address raced; the other won
            return new PasswordRegistration(RegisterOutcome.EmailTaken, null, null);
        }

        var token = await IssueVerificationAsync(customer, ct);
        return new PasswordRegistration(RegisterOutcome.Created, customer, token);
    }

    public async Task<Customer?> LoginAsync(string email, string password, CancellationToken ct)
    {
        var normalized = Normalize(email);
        var identity = normalized is null ? null : await db.CustomerIdentities.Include(i => i.Customer)
            .FirstOrDefaultAsync(i => i.Provider == IdentityProviders.Password && i.ProviderSubject == normalized, ct);

        var ok = hasher.Verify(password ?? "", identity?.PasswordHash ?? DummyHash); // always one hash comparison, match or not
        if (identity is null || !ok) return null;
        var c = identity.Customer;
        return c.IsActive && c.DeletedAt is null ? c : null; // suspended / erased: indistinguishable from a wrong password
    }

    public async Task<string?> IssueVerificationAsync(Customer customer, CancellationToken ct)
    {
        if (customer.Email is null || customer.EmailVerified) return null;
        return await IssueAsync(customer, EmailTokenPurposes.Verify, VerifyLifetime, ct);
    }

    public async Task<Customer?> VerifyEmailAsync(string? rawToken, CancellationToken ct)
    {
        var customerId = await ConsumeAsync(rawToken, EmailTokenPurposes.Verify, ct);
        if (customerId is null) return null;
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == customerId, ct);
        if (customer is null || !customer.IsActive || customer.DeletedAt is not null) return null;

        await ConfirmEmailAsync(customer, ct);
        return customer;
    }

    public async Task<(Customer Customer, string Token)?> StartResetAsync(string email, CancellationToken ct)
    {
        var normalized = Normalize(email);
        if (normalized is null) return null;
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Email == normalized && c.IsActive && c.DeletedAt == null, ct);
        if (customer is null) return null;
        return (customer, await IssueAsync(customer, EmailTokenPurposes.Reset, ResetLifetime, ct));
    }

    public async Task<Customer?> ResetPasswordAsync(string? rawToken, string newPassword, CancellationToken ct)
    {
        // Validate the new password BEFORE spending the single-use token, so a typo does not burn the link.
        var preview = await PeekAsync(rawToken, EmailTokenPurposes.Reset, ct);
        if (preview is null) return null;
        var customer = await db.Customers.Include(c => c.Identities).FirstOrDefaultAsync(c => c.Id == preview, ct);
        if (customer is null || !customer.IsActive || customer.DeletedAt is not null) return null;
        if (CheckPassword(newPassword, customer.Email) is { } weak) throw new ServiceException(ErrorKind.InvalidArgument, weak);

        if (await ConsumeAsync(rawToken, EmailTokenPurposes.Reset, ct) is null) return null; // lost a race with another use of the same link

        var identity = customer.Identities.FirstOrDefault(i => i.Provider == IdentityProviders.Password);
        if (identity is null)
            db.CustomerIdentities.Add(new CustomerIdentity
            {
                TenantId = customer.TenantId, CustomerId = customer.Id, Provider = IdentityProviders.Password, ProviderSubject = customer.Email!,
                Email = customer.Email, EmailVerified = true, PasswordHash = hasher.Hash(newPassword),
            });
        else
        {
            identity.PasswordHash = hasher.Hash(newPassword);
            identity.EmailVerified = true;
        }
        await ConfirmEmailAsync(customer, ct, save: false);
        await db.SaveChangesAsync(ct);

        // Whoever was signed in — including someone who had guessed or stolen the old password — is signed out now.
        await sessions.EndAllSessionsAsync(customer.TenantId, customer.Id, ct);
        logger.LogInformation("Customer {CustomerId} reset their password; all sessions ended", customer.Id);
        return customer;
    }

    // ------------------------------------------------------------------------------------------ tokens

    private async Task<string> IssueAsync(Customer customer, string purpose, TimeSpan lifetime, CancellationToken ct)
    {
        var raw = Base64Url(RandomNumberGenerator.GetBytes(32));
        db.CustomerEmailTokens.Add(new CustomerEmailToken
        {
            TenantId = customer.TenantId, CustomerId = customer.Id, Purpose = purpose, TokenHash = Hash(raw), ExpiresAt = DateTimeOffset.UtcNow.Add(lifetime),
        });
        await db.SaveChangesAsync(ct);
        return raw;
    }

    private async Task<Guid?> PeekAsync(string? raw, string purpose, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.Length > 200) return null;
        var hash = Hash(raw);
        var now = DateTimeOffset.UtcNow;
        return await db.CustomerEmailTokens.Where(t => t.TokenHash == hash && t.Purpose == purpose && t.ConsumedAt == null && t.ExpiresAt > now)
            .Select(t => (Guid?)t.CustomerId).FirstOrDefaultAsync(ct);
    }

    /// <summary>Marks the token used, atomically: of two simultaneous redemptions exactly one gets the customer.</summary>
    private async Task<Guid?> ConsumeAsync(string? raw, string purpose, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.Length > 200) return null;
        var hash = Hash(raw);
        var now = DateTimeOffset.UtcNow;
        var token = await db.CustomerEmailTokens.Where(t => t.TokenHash == hash && t.Purpose == purpose && t.ConsumedAt == null && t.ExpiresAt > now).FirstOrDefaultAsync(ct);
        if (token is null) return null;
        var updated = await db.CustomerEmailTokens.Where(t => t.Id == token.Id && t.ConsumedAt == null).ExecuteUpdateAsync(s => s.SetProperty(t => t.ConsumedAt, now), ct);
        return updated == 1 ? token.CustomerId : null;
    }

    private async Task ConfirmEmailAsync(Customer customer, CancellationToken ct, bool save = true)
    {
        customer.EmailVerified = true;
        foreach (var identity in await db.CustomerIdentities.Where(i => i.CustomerId == customer.Id && i.Provider == IdentityProviders.Password).ToListAsync(ct))
            identity.EmailVerified = true;
        if (save) await db.SaveChangesAsync(ct);
    }

    // ------------------------------------------------------------------------------------------ helpers

    private void EnsureTenant(string tenantId)
    {
        if (tenantAccessor.Current?.TenantId != tenantId) throw new InvalidOperationException("The ambient tenant does not match the tenant being registered in.");
    }

    internal static string? Normalize(string? email)
    {
        var e = email?.Trim().ToLowerInvariant();
        return !string.IsNullOrEmpty(e) && e.Length <= 320 && MailAddress.TryCreate(e, out var m) && m.Address == e ? e : null;
    }

    /// <summary>"+dial national" as the storefront sends it (e.g. "+880 01712345678"), or null if it is not a plausible mobile number.</summary>
    internal static string? NormalizePhone(string? phone)
    {
        var p = phone is null ? "" : Regex.Replace(phone.Trim(), @"\s+", " ");
        return p.Length <= 40 && Regex.IsMatch(p, @"^\+\d{1,4} ?\d{6,15}$") ? p : null;
    }

    private static string? Clean(string? name) => string.IsNullOrWhiteSpace(name) ? null : name.Trim();
    private static string Hash(string raw) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
