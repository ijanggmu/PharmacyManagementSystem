using FSH.Framework.Core.Domain;

namespace FSH.Modules.Suppliers.Domain;

/// <summary>
/// AP subledger owner. <see cref="CurrentBalance"/> is a denormalized running total kept in sync
/// by <see cref="ApplyLedgerEntry"/> — the corresponding <see cref="SupplierLedgerEntry"/> row is
/// the append-only audit trail (never updated/deleted; corrections are new offsetting entries,
/// mirroring the eventual Accounting voucher model — pharmacy-modules-plan.md §4.2).
/// </summary>
public sealed class Supplier : AggregateRoot<Guid>, ISoftDeletable
{
    public string Name { get; private set; } = default!;
    public string? ContactPerson { get; private set; }
    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public string? Address { get; private set; }
    public string? TaxId { get; private set; }

    /// <summary>Positive = pharmacy owes the supplier (accounts payable).</summary>
    public decimal CurrentBalance { get; private set; }
    public bool IsActive { get; private set; } = true;

    /// <summary>Default payment terms: a new bill from this supplier falls due this many days after the bill date
    /// (0 = due on receipt). Null = no terms recorded; such bills carry no due date and are aged by bill date.</summary>
    public int? CreditDays { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTimeOffset? DeletedOnUtc { get; private set; }
    public string? DeletedBy { get; private set; }

    private Supplier() { }

    public static Supplier Create(
        string name,
        string? contactPerson,
        string? phone,
        string? email,
        string? address,
        string? taxId,
        decimal openingBalance,
        int? creditDays = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        PaymentTerms.EnsureValidCreditDays(creditDays);

        return new Supplier
        {
            Id = Guid.CreateVersion7(),
            Name = name.Trim(),
            ContactPerson = contactPerson?.Trim(),
            Phone = phone?.Trim(),
            Email = email?.Trim(),
            Address = address?.Trim(),
            TaxId = taxId?.Trim(),
            CurrentBalance = openingBalance,
            CreditDays = creditDays,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public void Update(
        string name,
        string? contactPerson,
        string? phone,
        string? email,
        string? address,
        string? taxId,
        bool isActive,
        int? creditDays = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        PaymentTerms.EnsureValidCreditDays(creditDays);

        Name = name.Trim();
        ContactPerson = contactPerson?.Trim();
        Phone = phone?.Trim();
        Email = email?.Trim();
        Address = address?.Trim();
        TaxId = taxId?.Trim();
        IsActive = isActive;
        CreditDays = creditDays;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>The due date of a bill dated <paramref name="billDateUtc"/> under this supplier's terms, unless
    /// <paramref name="overrideDueDateUtc"/> (set on the bill itself) gives one.</summary>
    public DateTime? DueDateFor(DateTime billDateUtc, DateTime? overrideDueDateUtc = null) =>
        PaymentTerms.DueDate(billDateUtc, CreditDays, overrideDueDateUtc);

    /// <summary>
    /// Applies a ledger movement to the running balance and returns the new balance, for the
    /// caller to stamp onto the <see cref="SupplierLedgerEntry"/> it is about to persist.
    /// Debit increases what the pharmacy owes (e.g. a purchase received); credit decreases it
    /// (e.g. a payment made or a return).
    /// </summary>
    public decimal ApplyLedgerEntry(decimal debitAmount, decimal creditAmount)
    {
        if (debitAmount < 0 || creditAmount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(debitAmount), "Ledger amounts cannot be negative.");
        }

        CurrentBalance += debitAmount - creditAmount;
        UpdatedAtUtc = DateTime.UtcNow;
        return CurrentBalance;
    }

    public void Restore()
    {
        if (!IsDeleted) return;
        IsDeleted = false;
        DeletedOnUtc = null;
        DeletedBy = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
