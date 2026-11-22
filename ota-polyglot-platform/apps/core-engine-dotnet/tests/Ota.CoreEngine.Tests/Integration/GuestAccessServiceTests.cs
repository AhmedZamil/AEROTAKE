using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.Tests.Fixtures;
using Xunit;

namespace Ota.CoreEngine.Tests.Integration;

/// <summary>P3-2: how a person with no account reaches their booking, and how a guest booking becomes part of an account.</summary>
[Collection(OtaCoreEngineCollection.Name)]
public class GuestAccessServiceTests(OtaCoreEngineFixture fixture)
{
    private static string NewTenant() => $"guest-{Guid.NewGuid():N}";
    private static string Pnr() => Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();

    private async Task<T> WithServiceAsync<T>(string tenant, Func<IGuestAccessService, OtaDbContext, Task<T>> body)
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        return await body(scope.ServiceProvider.GetRequiredService<IGuestAccessService>(), scope.ServiceProvider.GetRequiredService<OtaDbContext>());
    }

    private async Task<Guid> SeedCustomerAsync(string tenant, string? email = "cust@example.test")
    {
        using var scope = TestData.CreateTenantScope(fixture.Factory, tenant);
        var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
        var c = new Customer { TenantId = tenant, Email = email == null ? null : $"{Guid.NewGuid():N}-{email}", EmailVerified = true };
        db.Customers.Add(c);
        await db.SaveChangesAsync();
        return c.Id;
    }

    // ------------------------------------------------------------------------------------------ claim tokens

    [Fact]
    public async Task AClaimToken_OpensExactlyItsBooking_AndOnlyTheHashIsStored()
    {
        var tenant = NewTenant();
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "g@example.test");
        var other = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "o@example.test");

        var (found, storedHashes, raw) = await WithServiceAsync(tenant, async (svc, db) =>
        {
            var token = await svc.IssueClaimTokenAsync(booking, null, default);
            return (await svc.FindByClaimTokenAsync(token, default), await db.GuestClaimTokens.Select(t => t.TokenHash).ToListAsync(), token);
        });

        Assert.Equal(booking.Id, found!.Id);
        Assert.NotEqual(other.Id, found.Id);
        Assert.DoesNotContain(raw, storedHashes);                                             // the raw token is never stored…
        Assert.Contains(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant(), storedHashes); // …only its hash
        Assert.True(raw.Length >= 43);                                                        // 256 bits of randomness
    }

    [Fact]
    public async Task AnExpiredOrUnknownOrJunkToken_OpensNothing()
    {
        var tenant = NewTenant();
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "g@example.test");

        var results = await WithServiceAsync(tenant, async (svc, db) =>
        {
            var expired = await svc.IssueClaimTokenAsync(booking, TimeSpan.FromMilliseconds(1), default);
            await Task.Delay(50);
            return new[]
            {
                await svc.FindByClaimTokenAsync(expired, default), await svc.FindByClaimTokenAsync("never-issued", default),
                await svc.FindByClaimTokenAsync("", default), await svc.FindByClaimTokenAsync(null, default),
                await svc.FindByClaimTokenAsync(new string('x', 5000), default),
            };
        });

        Assert.All(results, Assert.Null);
    }

    [Fact]
    public async Task ATokenFromOneTenant_OpensNothingInAnother()
    {
        var (tenantA, tenantB) = (NewTenant(), NewTenant());
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenantA, Pnr(), guestEmail: "g@example.test");
        var token = await WithServiceAsync(tenantA, (svc, _) => svc.IssueClaimTokenAsync(booking, null, default));

        Assert.Null(await WithServiceAsync(tenantB, (svc, _) => svc.FindByClaimTokenAsync(token, default)));
        Assert.NotNull(await WithServiceAsync(tenantA, (svc, _) => svc.FindByClaimTokenAsync(token, default)));
    }

    [Fact]
    public async Task ATokenCannotBeIssuedFor_AnAgentsBooking_SoAGuestNeverReachesB2BData()
    {
        var (tenant, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        var b2b = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), channel: BookingChannels.B2BAgent, agentId: agentId);

        await Assert.ThrowsAsync<InvalidOperationException>(() => WithServiceAsync(tenant, (svc, _) => svc.IssueClaimTokenAsync(b2b, null, default)));
    }

    // ------------------------------------------------------------------------------------------ reference + surname

    [Theory]
    [InlineData("Rahman", true)]
    [InlineData("rahman", true)]
    [InlineData("  RAHMAN ", true)]
    [InlineData("Rahmán", true)]      // accents do not decide it
    [InlineData("Rahm an", true)]     // nor stray spaces
    [InlineData("Rahman-Khan", false)]
    [InlineData("Karim", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public async Task ALookup_ByReferenceAndSurname_IsForgivingAboutFormatButNothingElse(string? surname, bool expected)
    {
        var tenant = NewTenant();
        var pnr = Pnr();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, pnr, guestEmail: "g@example.test", lastName: "Rahman");

        var found = await WithServiceAsync(tenant, (svc, _) => svc.LookupAsync(pnr.ToLowerInvariant(), surname, default));

        Assert.Equal(expected, found is not null);
    }

    [Fact]
    public async Task ALookup_NeedsTheRightReference_TheSurnameAloneOpensNothing()
    {
        var tenant = NewTenant();
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, "ABC123", guestEmail: "g@example.test", lastName: "Rahman");

        Assert.Null(await WithServiceAsync(tenant, (svc, _) => svc.LookupAsync("ZZZ999", "Rahman", default)));
        Assert.Null(await WithServiceAsync(tenant, (svc, _) => svc.LookupAsync("", "Rahman", default)));
        Assert.Null(await WithServiceAsync(tenant, (svc, _) => svc.LookupAsync(new string('A', 200), "Rahman", default)));
    }

    [Fact]
    public async Task ALookup_NeverFindsAnAgentsBooking_EvenWithTheRightReferenceAndSurname()
    {
        var (tenant, agentId, _) = await TestData.SeedAgentAsync(fixture.Factory);
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, "AGENT1", channel: BookingChannels.B2BAgent, agentId: agentId, lastName: "Rahman");

        Assert.Null(await WithServiceAsync(tenant, (svc, _) => svc.LookupAsync("AGENT1", "Rahman", default)));
    }

    [Fact]
    public async Task ALookup_InAnotherTenant_FindsNothing()
    {
        var (tenantA, tenantB) = (NewTenant(), NewTenant());
        await TestData.SeedB2CBookingAsync(fixture.Factory, tenantA, "TENANT", guestEmail: "g@example.test");

        Assert.Null(await WithServiceAsync(tenantB, (svc, _) => svc.LookupAsync("TENANT", "Rahman", default)));
    }

    [Fact]
    public async Task ATravellerOtherThanTheFirst_CanBeUsedToLookUpTheBooking()
    {
        var tenant = NewTenant();
        using (var scope = TestData.CreateTenantScope(fixture.Factory, tenant))
        {
            var db = scope.ServiceProvider.GetRequiredService<OtaDbContext>();
            db.Bookings.Add(new Booking
            {
                TenantId = tenant, Channel = BookingChannels.B2C, GuestEmail = "g@example.test", Pnr = "FAMILY", OfferId = "X", SupplierCode = "S",
                IdempotencyKey = Guid.NewGuid().ToString(), Status = BookingStatus.Pending, FinalPrice = 1, Currency = "USD",
                TravelersJson = JsonSerializer.Serialize(new[] { new { FirstName = "A", LastName = "Rahman" }, new { FirstName = "B", LastName = "Chowdhury" } }),
            });
            await db.SaveChangesAsync();
        }

        Assert.NotNull(await WithServiceAsync(tenant, (svc, _) => svc.LookupAsync("FAMILY", "Chowdhury", default)));
    }

    // ------------------------------------------------------------------------------------------ what a guest may see

    [Fact]
    public async Task TheView_CarriesNoDocumentNumbers_NoSupplierReferences_AndNoMargins()
    {
        var tenant = NewTenant();
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "g@example.test");

        var json = JsonSerializer.Serialize(GuestAccessService.ToView(booking));

        foreach (var secret in new[] { "P9999999", "DocumentNumber", "PASSPORT", "SUPPLIER-SECRET-REF", "SupplierNetRate", "SubAgentMargin", "g@example.test" })
            Assert.DoesNotContain(secret, json);
        Assert.Contains(booking.Pnr, json);
        Assert.Contains("Rahman", json);
    }

    // ------------------------------------------------------------------------------------------ joining an account

    [Fact]
    public async Task AVerifiedEmail_AttachesGuestBookingsMadeWithThatAddress_CaseInsensitively_Only()
    {
        var tenant = NewTenant();
        var customerId = await SeedCustomerAsync(tenant);
        var mine1 = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "sam@example.test");
        var mine2 = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "SAM@Example.TEST");
        var someoneElses = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "other@example.test");
        var alreadyOwned = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "sam@example.test", customerId: await SeedCustomerAsync(tenant));

        var count = await WithServiceAsync(tenant, (svc, _) => svc.AttachByVerifiedEmailAsync(customerId, " Sam@example.test ", default));

        Assert.Equal(2, count);
        var owners = await WithServiceAsync(tenant, (_, db) => db.Bookings.Where(b => new[] { mine1.Id, mine2.Id, someoneElses.Id, alreadyOwned.Id }.Contains(b.Id)).ToDictionaryAsync(b => b.Id, b => b.CustomerId));
        Assert.Equal(customerId, owners[mine1.Id]);
        Assert.Equal(customerId, owners[mine2.Id]);
        Assert.Null(owners[someoneElses.Id]);                    // another address: untouched
        Assert.NotEqual(customerId, owners[alreadyOwned.Id]);    // someone else's booking is never stolen
        Assert.Equal(0, await WithServiceAsync(tenant, (svc, _) => svc.AttachByVerifiedEmailAsync(customerId, "sam@example.test", default))); // idempotent
    }

    [Fact]
    public async Task Attaching_StaysInsideTheTenant_AndNeverTouchesAnAgentsBooking()
    {
        var (tenantA, tenantB) = (NewTenant(), NewTenant());
        var customerB = await SeedCustomerAsync(tenantB);
        var inA = await TestData.SeedB2CBookingAsync(fixture.Factory, tenantA, Pnr(), guestEmail: "shared@example.test");

        var attached = await WithServiceAsync(tenantB, (svc, _) => svc.AttachByVerifiedEmailAsync(customerB, "shared@example.test", default));

        Assert.Equal(0, attached);
        Assert.Null((await WithServiceAsync(tenantA, (_, db) => db.Bookings.SingleAsync(b => b.Id == inA.Id))).CustomerId);
    }

    [Fact]
    public async Task ClaimingWithAToken_AttachesTheBooking_AndMarksTheTokenUsed()
    {
        var tenant = NewTenant();
        var customerId = await SeedCustomerAsync(tenant);
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), guestEmail: "g@example.test");
        var token = await WithServiceAsync(tenant, (svc, _) => svc.IssueClaimTokenAsync(booking, null, default));

        var first = await WithServiceAsync(tenant, (svc, _) => svc.ClaimAsync(customerId, token, default));
        var again = await WithServiceAsync(tenant, (svc, _) => svc.ClaimAsync(customerId, token, default));

        Assert.Equal((ClaimOutcome.Attached, ClaimOutcome.AlreadyYours), (first, again));
        Assert.Equal(customerId, (await WithServiceAsync(tenant, (_, db) => db.Bookings.SingleAsync(b => b.Id == booking.Id))).CustomerId);
        Assert.NotNull((await WithServiceAsync(tenant, (_, db) => db.GuestClaimTokens.SingleAsync(t => t.BookingId == booking.Id))).ConsumedAt);
    }

    [Fact]
    public async Task ATokenForABookingThatBelongsToSomeoneElse_LooksLikeAnUnknownToken()
    {
        var tenant = NewTenant();
        var owner = await SeedCustomerAsync(tenant);
        var thief = await SeedCustomerAsync(tenant);
        var booking = await TestData.SeedB2CBookingAsync(fixture.Factory, tenant, Pnr(), customerId: owner);
        var token = await WithServiceAsync(tenant, (svc, _) => svc.IssueClaimTokenAsync(booking, null, default));

        var outcome = await WithServiceAsync(tenant, (svc, _) => svc.ClaimAsync(thief, token, default));

        Assert.Equal(ClaimOutcome.NotFound, outcome);
        Assert.Equal(owner, (await WithServiceAsync(tenant, (_, db) => db.Bookings.SingleAsync(b => b.Id == booking.Id))).CustomerId);
    }

    [Fact]
    public async Task ClaimingWithABadToken_IsNotFound()
    {
        var tenant = NewTenant();
        var customerId = await SeedCustomerAsync(tenant);

        foreach (var junk in new[] { "junk", "", null })
            Assert.Equal(ClaimOutcome.NotFound, await WithServiceAsync(tenant, (svc, _) => svc.ClaimAsync(customerId, junk, default)));
    }
}
