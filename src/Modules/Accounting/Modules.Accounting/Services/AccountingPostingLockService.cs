using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Loads (creating on first use) this tenant's single <see cref="AccountingPostingLock"/> row and
/// exposes the guard every posting path (<c>VoucherPostingService</c>, manual <c>PostVoucher</c>,
/// <c>ReverseVoucher</c>) calls before writing a voucher — root plan §5 "posting-lock ordering".
/// </summary>
public sealed class AccountingPostingLockService(AccountingDbContext dbContext)
{
    public async Task<AccountingPostingLock> GetOrCreateAsync(CancellationToken cancellationToken = default)
    {
        var lockRow = await dbContext.PostingLocks.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        if (lockRow is not null)
        {
            return lockRow;
        }

        lockRow = AccountingPostingLock.CreateEmpty();
        dbContext.PostingLocks.Add(lockRow);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return lockRow;
    }

    /// <summary>Throws <c>CustomException</c> (409) if <paramref name="voucherDateUtc"/> falls on or
    /// before the tenant's lock date. The lock date is a Nepal calendar date, so the instant is converted
    /// to its Nepal day first (a voucher at 00:30 NPT on the day after the lock date is still open even
    /// though it is the lock date in UTC).</summary>
    public async Task AssertPostingOpenAsync(DateTime voucherDateUtc, CancellationToken cancellationToken = default)
    {
        var lockRow = await GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        lockRow.AssertOpen(NepalDate.FromUtc(voucherDateUtc));
    }

    /// <summary>Whether <paramref name="voucherDateUtc"/> falls in an open (unlocked) period.</summary>
    public async Task<bool> IsOpenAsync(DateTime voucherDateUtc, CancellationToken cancellationToken = default)
    {
        var lockRow = await GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        return lockRow.LockDate is not { } locked || NepalDate.FromUtc(voucherDateUtc) > locked;
    }

    /// <summary>
    /// The date a system voucher should carry: <paramref name="businessDateUtc"/> when its period is still
    /// open, otherwise the first instant of the first open Nepal day (or now, if later). A business event
    /// that happened in a closed period (a back-dated receipt, a cancellation of a sale from a locked month)
    /// is booked in the open period instead of being refused — refusing would dead-letter the integration
    /// event and leave the subledger and the GL out of step.
    /// </summary>
    public async Task<DateTime> ResolveOpenDateAsync(DateTime businessDateUtc, CancellationToken cancellationToken = default)
    {
        var lockRow = await GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        if (lockRow.LockDate is not { } locked || NepalDate.FromUtc(businessDateUtc) > locked)
        {
            return businessDateUtc;
        }

        DateTime firstOpenUtc = NepalDate.StartUtc(locked.AddDays(1));
        DateTime nowUtc = DateTime.UtcNow;
        return nowUtc > firstOpenUtc ? nowUtc : firstOpenUtc;
    }
}
