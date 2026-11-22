using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;

namespace Ota.CoreEngine.Payments;

public sealed record WalletBalance(decimal Balance, string Currency, bool InstantTopUp);

public interface IWalletService
{
    Task<WalletBalance> GetAsync(Caller caller, bool instantTopUp, CancellationToken ct);

    /// <summary>Adds money without a card charge. Only when the host allows instant top-up (local development).</summary>
    Task<WalletBalance> TopUpAsync(Caller caller, decimal amount, bool instantTopUp, CancellationToken ct);

    /// <summary>Debits the booking total. Throws <see cref="ServiceException"/> with code wallet_insufficient when the balance is short.</summary>
    Task<Guid> DebitForBookingAsync(Caller caller, Booking booking, CancellationToken ct);

    /// <summary>Puts a wallet payment back. Used when ticketing or a cancel refunds a wallet charge. Idempotent per booking+amount note is not required; callers refund once.</summary>
    Task CreditAsync(string tenantId, Guid customerId, decimal amount, string currency, Guid? bookingId, string note, CancellationToken ct);
}

public sealed class WalletService(OtaDbContext db) : IWalletService
{
    public async Task<WalletBalance> GetAsync(Caller caller, bool instantTopUp, CancellationToken ct)
    {
        var customerId = RequireCustomer(caller);
        var wallet = await FindAsync(caller.TenantId, customerId, ct);
        return new WalletBalance(wallet?.Balance ?? 0m, wallet?.Currency ?? "BDT", instantTopUp);
    }

    public async Task<WalletBalance> TopUpAsync(Caller caller, decimal amount, bool instantTopUp, CancellationToken ct)
    {
        if (!instantTopUp)
            throw new ServiceException(ErrorKind.FailedPrecondition, "Adding money to the wallet is not available yet.", "wallet_topup_unavailable");
        if (amount is < 1 or > 100_000)
            throw new ServiceException(ErrorKind.InvalidArgument, "Enter an amount between 1 and 100,000.");

        var customerId = RequireCustomer(caller);
        return await InTransactionAsync(async () =>
        {
            var wallet = await EnsureAsync(caller.TenantId, customerId, "BDT", ct);
            var now = DateTimeOffset.UtcNow;
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""UPDATE payments."CustomerWallets" SET "Balance" = "Balance" + {amount}, "UpdatedAt" = {now} WHERE "Id" = {wallet.Id}""", ct);
            var balance = await BalanceOfAsync(wallet.Id, ct);
            db.WalletEntries.Add(Entry(caller.TenantId, customerId, amount, "credit", balance, null, "Top up"));
            await db.SaveChangesAsync(ct);
            return new WalletBalance(balance, wallet.Currency, instantTopUp);
        }, ct);
    }

    public async Task<Guid> DebitForBookingAsync(Caller caller, Booking booking, CancellationToken ct)
    {
        var customerId = RequireCustomer(caller);
        if (booking.CustomerId != customerId)
            throw new ServiceException(ErrorKind.PermissionDenied, "This booking is not yours.");

        return await InTransactionAsync(async () =>
        {
            var wallet = await EnsureAsync(caller.TenantId, customerId, booking.Currency, ct);
            if (!string.Equals(wallet.Currency, booking.Currency, StringComparison.OrdinalIgnoreCase))
                throw new ServiceException(ErrorKind.FailedPrecondition, "This wallet is in a different currency from the booking.", "wallet_currency");

            var now = DateTimeOffset.UtcNow;
            var taken = await db.Database.ExecuteSqlInterpolatedAsync(
                $"""UPDATE payments."CustomerWallets" SET "Balance" = "Balance" - {booking.FinalPrice}, "UpdatedAt" = {now} WHERE "Id" = {wallet.Id} AND "Balance" >= {booking.FinalPrice}""", ct);
            if (taken == 0)
                throw new ServiceException(
                    ErrorKind.FailedPrecondition,
                    $"Your wallet has {wallet.Balance:0.00} {wallet.Currency}. This booking is {booking.FinalPrice:0.00} {booking.Currency}.",
                    "wallet_insufficient");

            var balance = await BalanceOfAsync(wallet.Id, ct);
            var entry = Entry(caller.TenantId, customerId, booking.FinalPrice, "debit", balance, booking.Id, $"Booking {booking.Pnr}");
            db.WalletEntries.Add(entry);
            await db.SaveChangesAsync(ct);
            return entry.Id;
        }, ct);
    }

    public async Task CreditAsync(string tenantId, Guid customerId, decimal amount, string currency, Guid? bookingId, string note, CancellationToken ct)
    {
        if (amount <= 0) return;
        if (db.Database.CurrentTransaction is not null)
        {
            await ApplyCreditAsync(tenantId, customerId, amount, currency, bookingId, note, ct);
            return;
        }
        await InTransactionAsync(async () =>
        {
            await ApplyCreditAsync(tenantId, customerId, amount, currency, bookingId, note, ct);
            return 0;
        }, ct);
    }

    private async Task ApplyCreditAsync(string tenantId, Guid customerId, decimal amount, string currency, Guid? bookingId, string note, CancellationToken ct)
    {
        var wallet = await EnsureAsync(tenantId, customerId, currency, ct);
        var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""UPDATE payments."CustomerWallets" SET "Balance" = "Balance" + {amount}, "UpdatedAt" = {now} WHERE "Id" = {wallet.Id}""", ct);
        var balance = await BalanceOfAsync(wallet.Id, ct);
        db.WalletEntries.Add(Entry(tenantId, customerId, amount, "credit", balance, bookingId, note));
        await db.SaveChangesAsync(ct);
    }

    private async Task<T> InTransactionAsync<T>(Func<Task<T>> work, CancellationToken ct)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var result = await work();
            await tx.CommitAsync(ct);
            return result;
        });
    }

    private static Guid RequireCustomer(Caller caller)
    {
        if (caller.ActorType != ActorTypes.Customer || caller.CustomerId is null || caller.Channel != BookingChannels.B2C)
            throw new ServiceException(ErrorKind.PermissionDenied, "Sign in to use your wallet.");
        return caller.CustomerId.Value;
    }

    private Task<CustomerWallet?> FindAsync(string tenantId, Guid customerId, CancellationToken ct) =>
        db.CustomerWallets.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(w => w.TenantId == tenantId && w.CustomerId == customerId, ct);

    private async Task<CustomerWallet> EnsureAsync(string tenantId, Guid customerId, string currency, CancellationToken ct)
    {
        var wallet = await FindAsync(tenantId, customerId, ct);
        if (wallet is not null) return wallet;
        wallet = new CustomerWallet { TenantId = tenantId, CustomerId = customerId, Balance = 0m, Currency = currency };
        db.CustomerWallets.Add(wallet);
        await db.SaveChangesAsync(ct);
        db.Entry(wallet).State = EntityState.Detached;
        return wallet;
    }

    private async Task<decimal> BalanceOfAsync(Guid walletId, CancellationToken ct) =>
        await db.CustomerWallets.IgnoreQueryFilters().AsNoTracking().Where(w => w.Id == walletId).Select(w => w.Balance).FirstAsync(ct);

    private static WalletEntry Entry(string tenantId, Guid customerId, decimal amount, string kind, decimal balanceAfter, Guid? bookingId, string note) =>
        new()
        {
            TenantId = tenantId,
            CustomerId = customerId,
            Amount = amount,
            Kind = kind,
            BalanceAfter = balanceAfter,
            BookingId = bookingId,
            Note = note.Length <= 200 ? note : note[..200],
        };
}
