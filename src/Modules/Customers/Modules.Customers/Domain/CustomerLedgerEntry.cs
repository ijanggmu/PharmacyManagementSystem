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

    /// <summary>Reference type of the entry that voids a payment; its <see cref="ReferenceId"/> is the voided
    /// payment's entry id. A payment with such an entry is voided: the pair cancels out.</summary>
    public const string PaymentVoidReference = "CustomerPaymentVoid";

    /// <summary>The stored <see cref="PaymentMethod"/> of a cash payment.</summary>
    public const string CashPaymentMethod = "CASH";

    /// <summary>How a <see cref="CustomerLedgerEntryType.Payment"/> was received, upper-cased ("CASH", "CARD",
    /// "FONEPAY"...), so a cash drawer can count the cash taken in. Null on other entries and on payments
    /// recorded before it was captured.</summary>
    public string? PaymentMethod { get; private set; }

    /// <summary>When a debit (a sale on account) falls due: the sale date plus the customer's credit days at the
    /// time. Null on credits, for customers without terms, and on debits recorded before due dates existed -
    /// readers then fall back to the customer's current terms (<see cref="PaymentTerms.EffectiveDueDate"/>).</summary>
    public DateTime? DueDateUtc { get; private set; }

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
        string? documentNumber = null,
        Guid? id = null,
        string? paymentMethod = null,
        DateTime? dueDateUtc = null)
    {
        return new CustomerLedgerEntry
        {
            // Deterministic when the caller must apply an entry at most once (see CustomerEntryIds).
            Id = id ?? Guid.CreateVersion7(),
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
            PaymentMethod = string.IsNullOrWhiteSpace(paymentMethod) ? null : paymentMethod.Trim().ToUpperInvariant(),
            // A due date only means something on a debit (what the customer owes).
            DueDateUtc = debitAmount > 0 ? dueDateUtc : null,
        };
    }

    /// <summary>Fills in the document number on an entry recorded before it was captured (backfill only).</summary>
    public void BackfillDocumentNumber(string documentNumber)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(documentNumber);
        DocumentNumber ??= documentNumber.Trim();
    }
}
