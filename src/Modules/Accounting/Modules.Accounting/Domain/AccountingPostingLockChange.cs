using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// One change of the tenant's posting-lock date (who, when, from → to). Append-only: rows are only ever
/// inserted, by <see cref="AccountingPostingLock.SetLockDate"/>'s caller, never updated or deleted — the
/// lock row itself keeps just the latest value, so this is the audit trail for closing and reopening periods.
/// </summary>
public sealed class AccountingPostingLockChange : AggregateRoot<Guid>
{
    public const int MaxChangedByLength = 256;

    /// <summary>The lock date before the change; <c>null</c> when the books were open.</summary>
    public DateOnly? FromLockDate { get; private set; }

    /// <summary>The lock date after the change; <c>null</c> when the lock was cleared.</summary>
    public DateOnly? ToLockDate { get; private set; }
    public string ChangedBy { get; private set; } = default!;
    public DateTime ChangedAtUtc { get; private set; }

    private AccountingPostingLockChange() { }

    public static AccountingPostingLockChange Record(DateOnly? fromLockDate, DateOnly? toLockDate, string changedBy, DateTime changedAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(changedBy);
        string by = changedBy.Trim();

        return new AccountingPostingLockChange
        {
            Id = Guid.CreateVersion7(),
            FromLockDate = fromLockDate,
            ToLockDate = toLockDate,
            ChangedBy = by.Length > MaxChangedByLength ? by[..MaxChangedByLength] : by,
            ChangedAtUtc = changedAtUtc,
        };
    }
}
