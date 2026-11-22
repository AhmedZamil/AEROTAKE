using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P2-5: the consumer identity model. No login flow yet (Phase 3) — these pin down the rules the database itself
/// enforces so the flows built on top cannot get them wrong: per-tenant accounts, one provider account per customer per
/// tenant, lowercase emails, hashed guest tokens, and an honest CustomerId on bookings.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CustomerModelTests(OtaCoreEngineFixture fixture)
{
    private static string NewTenant() => $"cust-test-{Guid.NewGuid():N}";

    private (OtaDbContext Db, IServiceScope Scope) Open(string tenantId)
    {
        var scope = TestData.CreateTenantScope(fixture.Factory, tenantId);
        return (scope.ServiceProvider.GetRequiredService<OtaDbContext>(), scope);
    }

    private static Customer NewCustomer(string tenantId, string? email = null) =>
        new() { TenantId = tenantId, Email = email, FirstName = "Sam", LastName = "Rahman" };

    private static CustomerIdentity Identity(string tenantId, Customer customer, string provider = "google", string? subject = null) =>
        new() { TenantId = tenantId, Customer = customer, Provider = provider, ProviderSubject = subject ?? Guid.NewGuid().ToString("N"), EmailVerified = true };

    private static async Task<string?> RefusedByAsync(OtaDbContext db)
    {
        try { await db.SaveChangesAsync(); return null; }
        catch (DbUpdateException ex) { return (ex.InnerException as Npgsql.PostgresException)?.ConstraintName; }
    }

    [Fact]
    public async Task ACustomer_WithSeveralSignInMethods_IsStoredAndFoundAgain()
    {
        var tenant = NewTenant();
        var (db, scope) = Open(tenant);
        using var _ = scope;
        var customer = NewCustomer(tenant, "sam@example.test");
        customer.Identities.Add(Identity(tenant, customer, "google"));
        customer.Identities.Add(Identity(tenant, customer, "facebook"));
        db.Customers.Add(customer);
        await db.SaveChangesAsync();

        var (db2, scope2) = Open(tenant);
        using var __ = scope2;
        var found = await db2.Customers.Include(c => c.Identities).SingleAsync(c => c.Id == customer.Id);
        Assert.Equal(new[] { "facebook", "google" }, found.Identities.Select(i => i.Provider).Order());
    }

    [Fact]
    public async Task TheSameEmail_IsOneCustomerPerTenant_ButFreeInAnotherTenant()
    {
        var (tenantA, tenantB) = (NewTenant(), NewTenant());
        var (dbA, sA) = Open(tenantA); using var _1 = sA;
        dbA.Customers.Add(NewCustomer(tenantA, "same@example.test"));
        await dbA.SaveChangesAsync();

        dbA.Customers.Add(NewCustomer(tenantA, "same@example.test"));
        Assert.Equal("IX_Customers_TenantId_Email", await RefusedByAsync(dbA));

        var (dbB, sB) = Open(tenantB); using var _2 = sB;
        dbB.Customers.Add(NewCustomer(tenantB, "same@example.test")); // another brand: a separate account
        Assert.Null(await RefusedByAsync(dbB));
    }

    [Fact]
    public async Task CustomersWithNoEmail_MayRepeat()
    {
        var tenant = NewTenant();
        var (db, scope) = Open(tenant); using var _ = scope;
        db.Customers.AddRange(NewCustomer(tenant), NewCustomer(tenant), NewCustomer(tenant));

        Assert.Null(await RefusedByAsync(db));
    }

    [Theory]
    [InlineData("Sam@Example.test")]
    [InlineData(" sam@example.test")]
    public async Task AnEmailMustBeStoredLowercaseAndTrimmed(string email)
    {
        var tenant = NewTenant();
        var (db, scope) = Open(tenant); using var _ = scope;
        db.Customers.Add(NewCustomer(tenant, email));

        Assert.Equal("CK_Customers_EmailLowercase", await RefusedByAsync(db));
    }

    [Fact]
    public async Task AProviderAccount_BelongsToOneCustomerPerTenant()
    {
        var (tenantA, tenantB) = (NewTenant(), NewTenant());
        var subject = Guid.NewGuid().ToString("N");
        var (dbA, sA) = Open(tenantA); using var _1 = sA;
        var first = NewCustomer(tenantA); first.Identities.Add(Identity(tenantA, first, "google", subject));
        dbA.Customers.Add(first);
        await dbA.SaveChangesAsync();

        var second = NewCustomer(tenantA); second.Identities.Add(Identity(tenantA, second, "google", subject));
        dbA.Customers.Add(second);
        Assert.Equal("IX_CustomerIdentities_TenantId_Provider_ProviderSubject", await RefusedByAsync(dbA));

        // the same Google account signing up on another brand is a different customer
        var (dbB, sB) = Open(tenantB); using var _2 = sB;
        var other = NewCustomer(tenantB); other.Identities.Add(Identity(tenantB, other, "google", subject));
        dbB.Customers.Add(other);
        Assert.Null(await RefusedByAsync(dbB));
    }

    [Fact]
    public async Task OnlyKnownProvidersAreAccepted()
    {
        var tenant = NewTenant();
        var (db, scope) = Open(tenant); using var _ = scope;
        var customer = NewCustomer(tenant); customer.Identities.Add(Identity(tenant, customer, "twitter"));
        db.Customers.Add(customer);

        Assert.Equal("CK_CustomerIdentities_Provider", await RefusedByAsync(db));
    }

    [Fact]
    public async Task ACustomerIsInvisibleToOtherTenants()
    {
        var (tenantA, tenantB) = (NewTenant(), NewTenant());
        var (dbA, sA) = Open(tenantA); using var _1 = sA;
        var customer = NewCustomer(tenantA, "private@example.test");
        dbA.Customers.Add(customer);
        await dbA.SaveChangesAsync();

        var (dbB, sB) = Open(tenantB); using var _2 = sB;
        Assert.Empty(await dbB.Customers.Where(c => c.Id == customer.Id).ToListAsync());
        Assert.Empty(await dbB.Customers.Where(c => c.Email == "private@example.test").ToListAsync());
    }

    [Fact]
    public async Task AB2CBooking_CanOnlyPointAtACustomerThatExists()
    {
        var tenant = NewTenant();
        var (db, scope) = Open(tenant); using var _ = scope;
        var customer = NewCustomer(tenant, "buyer@example.test");
        db.Customers.Add(customer);
        await db.SaveChangesAsync();

        Booking BookingFor(Guid customerId) => new()
        {
            TenantId = tenant, Channel = BookingChannels.B2C, CustomerId = customerId, Pnr = Guid.NewGuid().ToString("N")[..6],
            OfferId = "X", SupplierCode = "S", IdempotencyKey = Guid.NewGuid().ToString(), Status = BookingStatus.Pending, FinalPrice = 1, Currency = "USD",
        };

        db.Bookings.Add(BookingFor(customer.Id));
        Assert.Null(await RefusedByAsync(db));

        db.Bookings.Add(BookingFor(Guid.NewGuid())); // no such customer
        Assert.Equal("FK_Bookings_Customers_CustomerId", await RefusedByAsync(db));
    }

    [Fact]
    public async Task ACustomerWithBookings_CannotBeDeletedOutFromUnderThem()
    {
        var tenant = NewTenant();
        var (db, scope) = Open(tenant); using var _ = scope;
        var customer = NewCustomer(tenant);
        db.Customers.Add(customer);
        await db.SaveChangesAsync();
        db.Bookings.Add(new Booking
        {
            TenantId = tenant, Channel = BookingChannels.B2C, CustomerId = customer.Id, Pnr = "DELCHK", OfferId = "X", SupplierCode = "S",
            IdempotencyKey = Guid.NewGuid().ToString(), Status = BookingStatus.Pending, FinalPrice = 1, Currency = "USD",
        });
        await db.SaveChangesAsync();

        db.Customers.Remove(customer);
        Assert.Equal("FK_Bookings_Customers_CustomerId", await RefusedByAsync(db)); // erasure anonymises; it does not delete
    }

    [Fact]
    public async Task DeletingACustomerRemovesTheirSignInMethods()
    {
        var tenant = NewTenant();
        var (db, scope) = Open(tenant); using var _ = scope;
        var customer = NewCustomer(tenant);
        customer.Identities.Add(Identity(tenant, customer));
        db.Customers.Add(customer);
        await db.SaveChangesAsync();

        db.Customers.Remove(customer);
        await db.SaveChangesAsync();

        Assert.Empty(await db.CustomerIdentities.Where(i => i.CustomerId == customer.Id).ToListAsync());
    }

    [Fact]
    public async Task AGuestClaimToken_MustBeAHash_AndIsUniqueAndTiedToARealBooking()
    {
        var (tenant, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var (db, scope) = Open(tenant); using var _ = scope;
        var booking = new Booking
        {
            TenantId = tenant, Channel = BookingChannels.B2C, GuestEmail = "guest@example.test", Pnr = "GUEST1", OfferId = "X", SupplierCode = "S",
            IdempotencyKey = Guid.NewGuid().ToString(), Status = BookingStatus.Pending, FinalPrice = 1, Currency = "USD",
        };
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Guid.NewGuid().ToByteArray())).ToLowerInvariant();
        GuestClaimToken Token(string h, Guid? bookingId = null) => new() { TenantId = tenant, BookingId = bookingId ?? booking.Id, TokenHash = h, ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) };

        db.GuestClaimTokens.Add(Token(hash));
        Assert.Null(await RefusedByAsync(db));

        db.GuestClaimTokens.Add(Token(hash));
        Assert.Equal("IX_GuestClaimTokens_TokenHash", await RefusedByAsync(db));
        db.ChangeTracker.Clear();

        db.GuestClaimTokens.Add(Token("not-a-hash-but-the-raw-token"));
        Assert.Equal("CK_GuestClaimTokens_HashFormat", await RefusedByAsync(db)); // a raw token can never be stored by mistake
        db.ChangeTracker.Clear();

        db.GuestClaimTokens.Add(Token(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData([1])).ToLowerInvariant(), Guid.NewGuid()));
        Assert.Equal("FK_GuestClaimTokens_Bookings_BookingId", await RefusedByAsync(db));
        Assert.NotEqual(Guid.Empty, agentId);
    }
}
