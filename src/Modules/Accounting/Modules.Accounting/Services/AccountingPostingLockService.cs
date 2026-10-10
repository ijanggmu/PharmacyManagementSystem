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
    /// before the tenant's lock date.</summary>
    public async Task AssertPostingOpenAsync(DateTime voucherDateUtc, CancellationToken cancellationToken = default)
    {
        var lockRow = await GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        lockRow.AssertOpen(DateOnly.FromDateTime(voucherDateUtc));
    }
}
