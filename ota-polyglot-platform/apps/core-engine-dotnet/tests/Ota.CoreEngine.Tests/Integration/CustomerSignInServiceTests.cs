using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P3-1: who a verified provider identity becomes. The rules that keep accounts from being taken over or duplicated.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class CustomerSignInServiceTests(OtaCoreEngineFixture fixture)
{
    private static string NewTenant() => $"signin-{Guid.NewGuid():N}";

    private static ExternalIdentity Google(string subject, string? email = null, bool verified = true, string? given = null, string? family = null) =>
        new("google", subject, email, verified, given, family);

    private async Task<CustomerSignIn> SignInAsync(string tenant, ExternalIdentity identity)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        return await scope.ServiceProvider.GetRequiredService<ICustomerSignInService>().SignInAsync(tenant, identity, default);
    }

    private async Task<T> QueryAsync<T>(string tenant, Func<OtaDbContext, Task<T>> query)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        return await query(scope.ServiceProvider.GetRequiredService<OtaDbContext>());
    }

    private async Task<Guid> SeedCustomerAsync(string tenant, string? email, bool emailVerified, bool active = true, DateTimeOffset? deletedAt = null)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var c = new Customer { TenantId = tenant, Email = email, EmailVerified = emailVerified, IsActive = active, DeletedAt = deletedAt };
        db.Customers.Add(c);
        await db.SaveChangesAsync();
        return c.Id;
    }

    [Fact]
    public async Task AFirstSignIn_CreatesTheCustomer_WithTheVerifiedEmailLowercased()
    {
        var tenant = NewTenant();

        var result = await SignInAsync(tenant, Google("g-1", "  Sam@Example.TEST ", given: "Sam", family: "Rahman"));

        Assert.True(result.IsNewCustomer);
        Assert.Equal(("sam@example.test", true, "Sam", "Rahman", tenant), (result.Customer.Email, result.Customer.EmailVerified, result.Customer.FirstName, result.Customer.LastName, result.Customer.TenantId));
    }

    [Fact]
    public async Task ASecondSignIn_WithTheSameProviderAccount_IsTheSameCustomer_NotANewOne()
    {
        var tenant = NewTenant();
        var first = await SignInAsync(tenant, Google("g-2", "a@example.test"));

        var second = await SignInAsync(tenant, Google("g-2", "a@example.test"));

        Assert.False(second.IsNewCustomer);
        Assert.Equal(first.Customer.Id, second.Customer.Id);
        Assert.Equal(1, await QueryAsync(tenant, db => db.Customers.CountAsync()));
    }

    [Fact]
    public async Task AChangedEmailAtTheProvider_DoesNotChangeWhoTheCustomerIs()
    {
        var tenant = NewTenant();
        var first = await SignInAsync(tenant, Google("g-3", "old@example.test"));

        var second = await SignInAsync(tenant, Google("g-3", "new@example.test")); // same account, new address

        Assert.Equal(first.Customer.Id, second.Customer.Id); // identity is the provider's subject, never the email
    }

    [Fact]
    public async Task TheSameProviderAccount_OnTwoBrands_IsTwoCustomers()
    {
        var (tenantA, tenantB) = (NewTenant(), NewTenant());

        var a = await SignInAsync(tenantA, Google("g-4", "same@example.test"));
        var b = await SignInAsync(tenantB, Google("g-4", "same@example.test"));

        Assert.NotEqual(a.Customer.Id, b.Customer.Id);
        Assert.Equal((tenantA, tenantB), (a.Customer.TenantId, b.Customer.TenantId));
    }

    [Fact]
    public async Task ANewProviderAccount_WithAVerifiedEmail_JoinsAnExistingVerifiedCustomer()
    {
        var tenant = NewTenant();
        var existing = await SeedCustomerAsync(tenant, "sam@example.test", emailVerified: true);

        var result = await SignInAsync(tenant, Google("g-5", "sam@example.test", verified: true));

        Assert.False(result.IsNewCustomer);
        Assert.Equal(existing, result.Customer.Id);
        Assert.Equal(1, await QueryAsync(tenant, db => db.CustomerIdentities.CountAsync(i => i.CustomerId == existing)));
    }

    [Fact]
    public async Task AnUnverifiedProviderEmail_IsNeverAReasonToJoinAnExistingCustomer_NorToStealTheirAddress()
    {
        var tenant = NewTenant();
        var victim = await SeedCustomerAsync(tenant, "victim@example.test", emailVerified: true);

        // an attacker registers a provider account claiming the victim's address without the provider verifying it
        var attacker = await SignInAsync(tenant, Google("g-attacker", "victim@example.test", verified: false));

        Assert.True(attacker.IsNewCustomer);
        Assert.NotEqual(victim, attacker.Customer.Id);
        Assert.Null(attacker.Customer.Email);           // does not take the victim's address
        Assert.False(attacker.Customer.EmailVerified);
    }

    [Fact]
    public async Task AnExistingCustomerWhoNeverVerifiedTheirEmail_IsNotJoinedEither_AndTheAddressStaysTheirs()
    {
        var tenant = NewTenant();
        var unverified = await SeedCustomerAsync(tenant, "typed@example.test", emailVerified: false);

        var result = await SignInAsync(tenant, Google("g-6", "typed@example.test", verified: true));

        Assert.True(result.IsNewCustomer);
        Assert.NotEqual(unverified, result.Customer.Id);
        Assert.Null(result.Customer.Email);             // the address is already held; we neither link nor duplicate it
        Assert.Equal("typed@example.test", (await QueryAsync(tenant, db => db.Customers.SingleAsync(c => c.Id == unverified))).Email);
    }

    [Fact]
    public async Task AProviderAccountWithNoEmail_StillGetsAnAccount_WithoutInventingOne()
    {
        var result = await SignInAsync(NewTenant(), Google("g-7", email: null));

        Assert.True(result.IsNewCustomer);
        Assert.Null(result.Customer.Email);
    }

    [Fact]
    public async Task ASuspendedCustomer_CannotSignIn()
    {
        var tenant = NewTenant();
        await SignInAsync(tenant, Google("g-8", "s@example.test"));
        await QueryAsync(tenant, async db => { await db.Customers.ExecuteUpdateAsync(s => s.SetProperty(c => c.IsActive, false)); return 0; });

        var ex = await Assert.ThrowsAsync<ServiceException>(() => SignInAsync(tenant, Google("g-8", "s@example.test")));

        Assert.Equal(ErrorKind.PermissionDenied, ex.Kind);
    }

    [Fact]
    public async Task AnErasedCustomer_CannotSignIn()
    {
        var tenant = NewTenant();
        await SignInAsync(tenant, Google("g-9", "e@example.test"));
        await QueryAsync(tenant, async db => { await db.Customers.ExecuteUpdateAsync(s => s.SetProperty(c => c.DeletedAt, DateTimeOffset.UtcNow)); return 0; });

        await Assert.ThrowsAsync<ServiceException>(() => SignInAsync(tenant, Google("g-9", "e@example.test")));
    }

    [Fact]
    public async Task ANewProviderAccount_CannotBeLinkedIntoASuspendedCustomer()
    {
        var tenant = NewTenant();
        await SeedCustomerAsync(tenant, "held@example.test", emailVerified: true, active: false);

        await Assert.ThrowsAsync<ServiceException>(() => SignInAsync(tenant, Google("g-10", "held@example.test", verified: true)));
    }

    [Fact]
    public async Task ManySimultaneousFirstSignIns_ForOneProviderAccount_ProduceExactlyOneCustomer()
    {
        var tenant = NewTenant();
        var identity = Google("g-race", "race@example.test");

        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() => SignInAsync(tenant, identity))));

        Assert.Single(results.Select(r => r.Customer.Id).Distinct());
        Assert.Equal(1, results.Count(r => r.IsNewCustomer)); // exactly one of them created it
        Assert.Equal((1, 1), (await QueryAsync(tenant, db => db.Customers.CountAsync()), await QueryAsync(tenant, db => db.CustomerIdentities.CountAsync())));
    }

    [Fact]
    public async Task SigningInForATenantOtherThanTheAmbientOne_IsRefused()
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, NewTenant());

        await Assert.ThrowsAsync<InvalidOperationException>(() => scope.ServiceProvider.GetRequiredService<ICustomerSignInService>()
            .SignInAsync(NewTenant(), Google("g-11"), default)); // the filter would be scoped to the wrong tenant
    }
}
