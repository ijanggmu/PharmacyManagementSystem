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

    /// <summary>
    /// Short, unique per-tenant customer number (e.g. C-000123), printed on the customer card and
    /// encoded in its QR so the customer is found at the counter by scan or by typing it.
    /// </summary>
    public string Code { get; private set; } = default!;
    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public string? Address { get; private set; }

    /// <summary>The customer's PAN / VAT registration number (a business buying on account); null when unknown.</summary>
    public string? PanNumber { get; private set; }

    /// <summary>
    /// Recorded allergies as free-text substance names. Matched by case-insensitive substring
    /// against medicine names at sale time (mirrors the legacy checkAllergies()).
    /// </summary>
    public string[] Allergies { get; private set; } = [];

    /// <summary>Recorded chronic conditions (free text), shown to the pharmacist at the counter.</summary>
    public string[] ChronicConditions { get; private set; } = [];

    /// <summary>Medicines the customer currently takes (free text), shown to the pharmacist at the counter.</summary>
    public string[] CurrentMedications { get; private set; } = [];

    /// <summary>
    /// Optimistic-concurrency token. On PostgreSQL it maps to the row's <c>xmin</c> system column, so
    /// every UPDATE carries <c>WHERE xmin = @original</c> and a concurrent write surfaces as a
    /// <c>DbUpdateConcurrencyException</c> instead of silently overwriting the balance or points.
    /// </summary>
    public uint RowVersion { get; }

    /// <summary>Positive = the customer owes the pharmacy (accounts receivable, e.g. credit sales).</summary>
    public decimal CurrentBalance { get; private set; }

    /// <summary>
    /// Most the customer may owe on account. Null = no limit. A credit sale that would push
    /// <see cref="CurrentBalance"/> past it is refused unless the cashier may override.
    /// </summary>
    public decimal? CreditLimit { get; private set; }

    /// <summary>Payment terms: a sale on account falls due this many days after the sale (0 = due the same day).
    /// Null = no terms recorded; such debts carry no due date and are aged by date.</summary>
    public int? CreditDays { get; private set; }

    /// <summary>Loyalty programme member: earns points on purchases and gets the member discount.</summary>
    public bool IsMember { get; private set; }
    public DateTime? MemberSinceUtc { get; private set; }

    /// <summary>Points available to redeem; changed only through <see cref="CustomerLoyaltyEntry"/> movements.</summary>
    public int LoyaltyPoints { get; private set; }

    /// <summary>
    /// The customer agreed to automated SMS (refill reminders and automatic dues reminders). Off by default; turning
    /// it off is how a customer who replied STOP is opted out. Staff-initiated messages (a dues reminder sent by hand,
    /// a receipt the cashier ticked) do not depend on it.
    /// </summary>
    public bool SmsConsent { get; private set; }
    public DateTime? SmsConsentChangedAtUtc { get; private set; }

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
        decimal openingBalance,
        string code,
        decimal? creditLimit = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(code);
        ValidateCreditLimit(creditLimit);

        return new Customer
        {
            Id = Guid.CreateVersion7(),
            Name = name.Trim(),
            Code = code.Trim(),
            CreditLimit = creditLimit,
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
        Allergies = NormalizeList(allergies);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Replaces the chronic-condition list (same normalization as <see cref="SetAllergies"/>).</summary>
    public void SetChronicConditions(IEnumerable<string> conditions)
    {
        ChronicConditions = NormalizeList(conditions);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Replaces the current-medication list (same normalization as <see cref="SetAllergies"/>).</summary>
    public void SetCurrentMedications(IEnumerable<string> medications)
    {
        CurrentMedications = NormalizeList(medications);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string[] NormalizeList(IEnumerable<string> values)
    {
        ArgumentNullException.ThrowIfNull(values);

        return values
            .Select(a => a?.Trim() ?? string.Empty)
            .Where(a => a.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
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

    /// <summary>Sets the payment terms in days; null removes them.</summary>
    public void SetCreditDays(int? creditDays)
    {
        PaymentTerms.EnsureValidCreditDays(creditDays);
        CreditDays = creditDays;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>The due date of a sale on account made at <paramref name="saleDateUtc"/> under this customer's terms.</summary>
    public DateTime? DueDateFor(DateTime saleDateUtc) => PaymentTerms.DueDate(saleDateUtc, CreditDays);

    /// <summary>Sets the credit limit; null removes it (no limit).</summary>
    public void SetCreditLimit(decimal? creditLimit)
    {
        ValidateCreditLimit(creditLimit);
        CreditLimit = creditLimit;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Sets the PAN / VAT number (trimmed, inner spaces removed); blank clears it.</summary>
    public void SetPanNumber(string? panNumber)
    {
        PanNumber = NormalizePan(panNumber);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>The stored form of a PAN: trimmed, spaces removed, upper-cased; null when blank.</summary>
    public static string? NormalizePan(string? panNumber) =>
        string.IsNullOrWhiteSpace(panNumber)
            ? null
            : panNumber.Replace(" ", string.Empty, StringComparison.Ordinal).Trim().ToUpperInvariant();

    public void SetSmsConsent(bool consent)
    {
        if (SmsConsent == consent) return;
        SmsConsent = consent;
        SmsConsentChangedAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = SmsConsentChangedAtUtc;
    }

    public void SetMembership(bool isMember)
    {
        if (IsMember == isMember) return;
        IsMember = isMember;
        MemberSinceUtc = isMember ? DateTime.UtcNow : MemberSinceUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Moves the points balance by <paramref name="points"/> and returns the new balance. A removal
    /// larger than the balance only takes what's there (points never go negative); the applied change
    /// is returned through <paramref name="applied"/>.
    /// </summary>
    public int ApplyLoyaltyPoints(int points, out int applied)
    {
        applied = points < 0 ? -Math.Min(-points, LoyaltyPoints) : points;
        LoyaltyPoints += applied;
        UpdatedAtUtc = DateTime.UtcNow;
        return LoyaltyPoints;
    }

    /// <summary>How much more may go on account before the limit; null when there is no limit.</summary>
    public decimal? AvailableCredit => CreditLimit is { } limit ? limit - CurrentBalance : null;

    private static void ValidateCreditLimit(decimal? creditLimit)
    {
        if (creditLimit < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(creditLimit), creditLimit, "Credit limit cannot be negative.");
        }
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
