using FSH.Framework.Core.Domain;

namespace FSH.Modules.Customers.Domain;

public enum CustomerLedgerEntryType
{
    OpeningBalance = 0,
    Sale = 1,
    Payment = 2,
    Refund = 3,
    Adjustment = 4,
}

/// <summary>
/// Append-only. Never updated or deleted after insert — corrections are new offsetting entries.
/// Inserted directly (not through <see cref="Customer"/>'s navigation collection), so it is not
/// subject to the nav-child <c>ValueGeneratedNever</c> footgun (database.md).
/// </summary>
public sealed class CustomerLedgerEntry : AggregateRoot<Guid>
{
    public Guid CustomerId { get; private set; }
    public DateTime EntryDateUtc { get; private set; }
    public CustomerLedgerEntryType EntryType { get; private set; }
    public string? Description { get; private set; }
    public decimal DebitAmount { get; private set; }
    public decimal CreditAmount { get; private set; }
    public decimal RunningBalance { get; private set; }
    public string? ReferenceType { get; private set; }
    public Guid? ReferenceId { get; private set; }

    /// <summary>The document number for this entry: the sale's IRD invoice number (INV-…) or the payment's
    /// receipt number (RCP-…). Null on opening balances and legacy rows not yet backfilled.</summary>
    public string? DocumentNumber { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// Nullable per docs/branch-scoping-plan.md §2 ("ledger/reporting entities keep branch_id
    /// nullable on purpose") — mirrors the Next.js <c>customer_ledger_entries.branch_id</c> column
    /// (script 63). <c>null</c> = legacy/tenant-wide row; new rows are stamped via
    /// <see cref="FSH.Modules.Multitenancy.Contracts.ICurrentBranch.GetBranchIdAsync"/>.
    /// </summary>
    public Guid? BranchId { get; private set; }

    private CustomerLedgerEntry() { }

    public static CustomerLedgerEntry Create(
        Guid customerId,
        DateTime entryDateUtc,
        CustomerLedgerEntryType entryType,
        string? description,
        decimal debitAmount,
        decimal creditAmount,
        decimal runningBalance,
        string? referenceType = null,
        Guid? referenceId = null,
        Guid? branchId = null,
        string? documentNumber = null)
    {
        return new CustomerLedgerEntry
        {
            Id = Guid.CreateVersion7(),
            CustomerId = customerId,
            EntryDateUtc = entryDateUtc,
            EntryType = entryType,
            Description = description?.Trim(),
            DebitAmount = debitAmount,
            CreditAmount = creditAmount,
            RunningBalance = runningBalance,
            ReferenceType = referenceType,
            ReferenceId = referenceId,
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
            DocumentNumber = string.IsNullOrWhiteSpace(documentNumber) ? null : documentNumber.Trim(),
        };
    }

    /// <summary>Fills in the document number on an entry recorded before it was captured (backfill only).</summary>
    public void BackfillDocumentNumber(string documentNumber)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(documentNumber);
        DocumentNumber ??= documentNumber.Trim();
    }
}
