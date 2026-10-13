using FSH.Framework.Core.Domain;

namespace FSH.Modules.Suppliers.Domain;

public enum SupplierLedgerEntryType
{
    OpeningBalance = 0,
    Purchase = 1,
    Payment = 2,
    Return = 3,
    Adjustment = 4,
}

/// <summary>
/// Append-only. Never updated or deleted after insert — corrections are new offsetting entries.
/// Inserted directly (not through <see cref="Supplier"/>'s navigation collection), so it is not
/// subject to the nav-child <c>ValueGeneratedNever</c> footgun (database.md).
/// </summary>
public sealed class SupplierLedgerEntry : AggregateRoot<Guid>
{
    public Guid SupplierId { get; private set; }
    public DateTime EntryDateUtc { get; private set; }
    public SupplierLedgerEntryType EntryType { get; private set; }
    public string? Description { get; private set; }
    public decimal DebitAmount { get; private set; }
    public decimal CreditAmount { get; private set; }
    public decimal RunningBalance { get; private set; }
    public string? ReferenceType { get; private set; }
    public Guid? ReferenceId { get; private set; }

    /// <summary>Our number for the document this entry relates to — the GRN number of a goods receipt
    /// (e.g. <c>GRN-MAIN-2083/84-00002</c>), or, on a payment allocated to a bill, that bill's number.
    /// Null on entries without one (opening balances, legacy rows).</summary>
    public string? DocumentNumber { get; private set; }

    /// <summary>The supplier's own invoice / bill number for the purchase this entry relates to.</summary>
    public string? SupplierBillNumber { get; private set; }

    /// <summary>TDS withheld (tax deducted at source). On a payment the entry still credits the full amount settled
    /// (<see cref="CreditAmount"/>); the supplier received <see cref="CreditAmount"/> − TDS in money and the TDS was
    /// deposited with IRD on their behalf. On an expense bill it is what was withheld before the bill (already net of
    /// it) was posted. Zero without TDS.</summary>
    public decimal TdsAmount { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// Nullable per docs/branch-scoping-plan.md §2 — ledger/reporting entities keep <c>BranchId</c>
    /// nullable (NULL = legacy/tenant-wide); sourced via <c>ICurrentBranch.GetBranchIdAsync()</c> at
    /// every call site, persisting <c>null</c> when it returns <c>null</c>.
    /// </summary>
    public Guid? BranchId { get; private set; }

    /// <summary>Reference type of the entry that voids a payment; its <see cref="ReferenceId"/> is the voided
    /// payment's entry id. A payment with such an entry is voided: the pair cancels out.</summary>
    public const string PaymentVoidReference = "SupplierPaymentVoid";

    private SupplierLedgerEntry() { }

    public static SupplierLedgerEntry Create(
        Guid supplierId,
        DateTime entryDateUtc,
        SupplierLedgerEntryType entryType,
        string? description,
        decimal debitAmount,
        decimal creditAmount,
        decimal runningBalance,
        string? referenceType = null,
        Guid? referenceId = null,
        Guid? branchId = null,
        string? documentNumber = null,
        string? supplierBillNumber = null,
        Guid? id = null,
        decimal tdsAmount = 0m)
    {
        if (tdsAmount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(tdsAmount), "TDS can't be negative.");
        }

        return new SupplierLedgerEntry
        {
            // Deterministic when the caller must apply an entry at most once (a payment's void).
            Id = id ?? Guid.CreateVersion7(),
            SupplierId = supplierId,
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
            SupplierBillNumber = string.IsNullOrWhiteSpace(supplierBillNumber) ? null : supplierBillNumber.Trim(),
            TdsAmount = tdsAmount,
        };
    }

    /// <summary>Fills in document numbers on an entry recorded before they were captured (backfill only;
    /// never overwrites a number already set).</summary>
    public void BackfillDocumentNumbers(string? documentNumber, string? supplierBillNumber)
    {
        if (DocumentNumber is null && !string.IsNullOrWhiteSpace(documentNumber))
        {
            DocumentNumber = documentNumber.Trim();
        }

        if (SupplierBillNumber is null && !string.IsNullOrWhiteSpace(supplierBillNumber))
        {
            SupplierBillNumber = supplierBillNumber.Trim();
        }
    }
}
