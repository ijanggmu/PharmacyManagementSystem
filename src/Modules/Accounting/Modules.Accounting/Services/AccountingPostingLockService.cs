using System.Net;
using FSH.Framework.Core.Exceptions;
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
    /// <summary>
    /// The tenant's lock row. The seed creates it; for a tenant seeded before that, the first caller creates
    /// it with an <c>INSERT ... ON CONFLICT DO NOTHING</c> on the per-tenant unique index, so two concurrent
    /// first postings can't end up with two lock rows (and a lock set on one of them ignored by the other).
    /// The insert is a single statement, so it never flushes the caller's pending changes.
    /// </summary>
    public async Task<AccountingPostingLock> GetOrCreateAsync(CancellationToken cancellationToken = default)
    {
        var lockRow = await dbContext.PostingLocks.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
        if (lockRow is not null)
        {
            return lockRow;
        }

        if (!dbContext.Database.IsRelational())
        {
            // InMemory (unit tests): no SQL, and no concurrency to guard against.
            lockRow = AccountingPostingLock.CreateEmpty();
            dbContext.PostingLocks.Add(lockRow);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return lockRow;
        }

        string tenantId = dbContext.TenantInfo?.Id
            ?? throw new InvalidOperationException("No tenant resolved for this request.");
        Guid id = Guid.CreateVersion7();
        await dbContext.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO accounting."PostingLocks" ("Id", "TenantId", "LockDate", "UpdatedAtUtc", "UpdatedBy")
            VALUES ({id}, {tenantId}, NULL, NULL, NULL)
            ON CONFLICT DO NOTHING
            """,
            cancellationToken).ConfigureAwait(false);

        return await dbContext.PostingLocks.FirstAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// The last day of the latest closed fiscal year, or <c>null</c> when no year is closed. Every day up to it is
    /// closed for posting whatever the lock row says: the lock can't be moved below it
    /// (<c>SetPostingLockCommandHandler</c>), and this guard holds even for a lock row that predates that rule.
    /// </summary>
    public Task<DateOnly?> GetClosedThroughAsync(CancellationToken cancellationToken = default) =>
        dbContext.FiscalYearCloses
            .AsNoTracking()
            .OrderByDescending(c => c.PeriodEnd)
            .Select(c => (DateOnly?)c.PeriodEnd)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>The day up to which nothing may post: the later of the lock date and the end of the latest closed
    /// fiscal year.</summary>
    public async Task<DateOnly?> GetEffectiveLockDateAsync(CancellationToken cancellationToken = default)
    {
        var lockRow = await GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        DateOnly? closedThrough = await GetClosedThroughAsync(cancellationToken).ConfigureAwait(false);
        return Later(lockRow.LockDate, closedThrough);
    }

    /// <summary>Throws <c>CustomException</c> (409) if <paramref name="voucherDateUtc"/> falls on or
    /// before the tenant's lock date, or inside a closed fiscal year. The lock date is a Nepal calendar date, so
    /// the instant is converted to its Nepal day first (a voucher at 00:30 NPT on the day after the lock date is
    /// still open even though it is the lock date in UTC).</summary>
    public async Task AssertPostingOpenAsync(DateTime voucherDateUtc, CancellationToken cancellationToken = default)
    {
        DateOnly voucherDay = NepalDate.FromUtc(voucherDateUtc);
        DateOnly? closedThrough = await GetClosedThroughAsync(cancellationToken).ConfigureAwait(false);
        if (closedThrough is { } closedEnd && voucherDay <= closedEnd)
        {
            throw new CustomException(
                $"Fiscal year closed: the books are closed up to {closedEnd:yyyy-MM-dd}, so nothing can be posted on {voucherDay:yyyy-MM-dd}. " +
                "Reopen the fiscal year to post into it.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var lockRow = await GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
        lockRow.AssertOpen(voucherDay);
    }

    /// <summary>Whether <paramref name="voucherDateUtc"/> falls in an open (unlocked, not year-closed) period.</summary>
    public async Task<bool> IsOpenAsync(DateTime voucherDateUtc, CancellationToken cancellationToken = default)
    {
        DateOnly? locked = await GetEffectiveLockDateAsync(cancellationToken).ConfigureAwait(false);
        return locked is not { } l || NepalDate.FromUtc(voucherDateUtc) > l;
    }

    /// <summary>
    /// The date a system voucher should carry: <paramref name="businessDateUtc"/> when its period is still
    /// open, otherwise now (which is in the open period, because the lock date can only be set to a day
    /// before today — <c>SetPostingLockCommandValidator</c>). A business event that happened in a closed
    /// period (a back-dated receipt, a cancellation of a sale from a locked month) is booked in the open
    /// period instead of being refused — refusing would dead-letter the integration event and leave the
    /// subledger and the GL out of step. A voucher is never dated after now: a lock row that still holds
    /// today or a future date (set before that rule existed) is refused with a message that says how to fix it.
    /// </summary>
    public async Task<DateTime> ResolveOpenDateAsync(DateTime businessDateUtc, CancellationToken cancellationToken = default)
    {
        DateOnly? effective = await GetEffectiveLockDateAsync(cancellationToken).ConfigureAwait(false);
        if (effective is not { } locked || NepalDate.FromUtc(businessDateUtc) > locked)
        {
            return businessDateUtc;
        }

        DateTime firstOpenUtc = NepalDate.StartUtc(locked.AddDays(1));
        DateTime nowUtc = DateTime.UtcNow;
        if (firstOpenUtc > nowUtc)
        {
            throw new CustomException(
                $"The accounting period is locked up to {locked:yyyy-MM-dd}, which is not in the past, so there is no open day to post on. " +
                "Move the posting-lock date back to a day before today.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        return nowUtc;
    }

    /// <summary>
    /// The date an owning flow's reversal should carry: <paramref name="requestedUtc"/> (never before
    /// <paramref name="originalVoucherDateUtc"/>), moved to the open period by <see cref="ResolveOpenDateAsync"/>
    /// when it falls in a locked one.
    /// </summary>
    public Task<DateTime> ResolveReversalDateAsync(
        DateTime requestedUtc, DateTime originalVoucherDateUtc, CancellationToken cancellationToken = default) =>
        ResolveOpenDateAsync(requestedUtc < originalVoucherDateUtc ? originalVoucherDateUtc : requestedUtc, cancellationToken);

    private static DateOnly? Later(DateOnly? a, DateOnly? b)
    {
        if (a is { } x && b is { } y)
        {
            return x > y ? x : y;
        }

        return a ?? b;
    }
}
