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
        decimal openingBalance)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

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
        bool isActive)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        Name = name.Trim();
        ContactPerson = contactPerson?.Trim();
        Phone = phone?.Trim();
        Email = email?.Trim();
        Address = address?.Trim();
        TaxId = taxId?.Trim();
        IsActive = isActive;
        UpdatedAtUtc = DateTime.UtcNow;
    }

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
