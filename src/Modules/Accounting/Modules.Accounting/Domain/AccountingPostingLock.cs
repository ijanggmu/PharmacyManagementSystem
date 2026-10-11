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

    public void SetLockDate(DateOnly? lockDate, string updatedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(updatedBy);
        LockDate = lockDate;
        UpdatedBy = updatedBy.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
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
