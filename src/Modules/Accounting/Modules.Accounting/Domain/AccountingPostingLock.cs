using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// Per-tenant accounting period lock: no voucher (manual, system, or a reversal) may be posted
/// with a voucher date on or before <see cref="LockDate"/>. One row per tenant — tenant isolation
/// is already enforced by <c>BaseDbContext</c>'s query filter, so there is no separate tenant key
/// here (mirrors the Next.js <c>system_settings</c> "accounting_posting_lock_date" key, ported as
/// its own small aggregate rather than a generic settings bag).
/// </summary>
public sealed class AccountingPostingLock : AggregateRoot<Guid>
{
    public DateOnly? LockDate { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }
    public string? UpdatedBy { get; private set; }

    private AccountingPostingLock() { }

    public static AccountingPostingLock CreateEmpty() => new() { Id = Guid.CreateVersion7() };

    /// <summary>
    /// Sets (or clears) the lock date. Returns the history row to append when the date actually changed,
    /// or <c>null</c> for a no-op save (same date) — this row only keeps the latest value, the history is
    /// <see cref="AccountingPostingLockChange"/>.
    /// </summary>
    public AccountingPostingLockChange? SetLockDate(DateOnly? lockDate, string updatedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(updatedBy);
        DateOnly? previous = LockDate;
        LockDate = lockDate;
        UpdatedBy = updatedBy.Trim();
        UpdatedAtUtc = DateTime.UtcNow;

        return previous == lockDate
            ? null
            : AccountingPostingLockChange.Record(previous, lockDate, UpdatedBy, UpdatedAtUtc.Value);
    }

    /// <summary>Throws if <paramref name="voucherDate"/> falls on or before the lock date.</summary>
    public void AssertOpen(DateOnly voucherDate)
    {
        if (LockDate is { } locked && voucherDate <= locked)
        {
            throw new CustomException(
                $"Accounting period closed: cannot post on or before {locked:yyyy-MM-dd}.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
