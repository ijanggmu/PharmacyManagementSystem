using FSH.Framework.Core.Domain;

namespace FSH.Modules.Customers.Domain;

/// <summary>
/// AR subledger owner. Mirrors <c>Modules.Suppliers.Domain.Supplier</c> (pharmacy-modules-plan.md
/// §4.2) — <see cref="CurrentBalance"/> is a denormalized running total kept in sync by
/// <see cref="ApplyLedgerEntry"/>; <see cref="CustomerLedgerEntry"/> is the append-only trail.
/// </summary>
public sealed class Customer : AggregateRoot<Guid>, ISoftDeletable
{
    public string Name { get; private set; } = default!;
    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public string? Address { get; private set; }

    /// <summary>
    /// Recorded allergies as free-text substance names. Matched by case-insensitive substring
    /// against medicine names at sale time (mirrors the legacy checkAllergies()).
    /// </summary>
    public string[] Allergies { get; private set; } = [];

    /// <summary>Positive = the customer owes the pharmacy (accounts receivable, e.g. credit sales).</summary>
    public decimal CurrentBalance { get; private set; }
    public bool IsActive { get; private set; } = true;

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTimeOffset? DeletedOnUtc { get; private set; }
    public string? DeletedBy { get; private set; }

    private Customer() { }

    public static Customer Create(
        string name,
        string? phone,
        string? email,
        string? address,
        decimal openingBalance)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        return new Customer
        {
            Id = Guid.CreateVersion7(),
            Name = name.Trim(),
            Phone = phone?.Trim(),
            Email = email?.Trim(),
            Address = address?.Trim(),
            CurrentBalance = openingBalance,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public void Update(string name, string? phone, string? email, string? address, bool isActive)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        Name = name.Trim();
        Phone = phone?.Trim();
        Email = email?.Trim();
        Address = address?.Trim();
        IsActive = isActive;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Replaces the allergy list. Entries are trimmed; blanks and case-insensitive duplicates are dropped.
    /// </summary>
    public void SetAllergies(IEnumerable<string> allergies)
    {
        ArgumentNullException.ThrowIfNull(allergies);

        Allergies = allergies
            .Select(a => a?.Trim() ?? string.Empty)
            .Where(a => a.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Applies a ledger movement and returns the new balance. Debit increases what the customer
    /// owes (e.g. a credit sale); credit decreases it (e.g. a payment received or a refund).
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
