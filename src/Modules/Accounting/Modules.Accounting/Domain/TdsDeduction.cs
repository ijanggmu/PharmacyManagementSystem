using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// One TDS deduction, for the TDS report (and the e-TDS upload): who it was withheld from (name + PAN), under which
/// category and rate, on what taxable amount, and how much. Written in the same transaction as the voucher that
/// credits TDS Payable, by the flow that owns the source document:
/// <list type="bullet">
/// <item><see cref="SourceTypes.Expense"/> — an expense with TDS (replaced on edit, removed on delete);</item>
/// <item><see cref="SourceTypes.SupplierPayment"/> — a supplier payment with TDS (from the Suppliers event).</item>
/// </list>
/// <see cref="SourceType"/> / <see cref="SourceId"/> equal the voucher's reference, so a deduction whose voucher has
/// been reversed (a voided supplier payment) is left out of the report. One row per source document.
/// </summary>
public sealed class TdsDeduction : AggregateRoot<Guid>
{
    public static class SourceTypes
    {
        public const string Expense = "Expense";
        public const string SupplierPayment = "SupplierPayment";
    }

    public string SourceType { get; private set; } = default!;
    public Guid SourceId { get; private set; }
    public DateTime DeductionDateUtc { get; private set; }
    public string VendorName { get; private set; } = default!;

    /// <summary>The payee's PAN / VAT number, when known (the e-TDS upload needs it).</summary>
    public string? Pan { get; private set; }
    public string CategoryCode { get; private set; } = default!;
    public string CategoryName { get; private set; } = default!;
    public decimal RatePercent { get; private set; }
    public decimal TaxableAmount { get; private set; }
    public decimal TdsAmount { get; private set; }

    /// <summary>The bill / receipt / payment reference the deduction was made against.</summary>
    public string? DocumentReference { get; private set; }
    public Guid? BranchId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private TdsDeduction() { }

    public static TdsDeduction Create(
        string sourceType, Guid sourceId, DateTime deductionDateUtc, string? vendorName, string? pan,
        TdsWithholding withholding, string? documentReference, Guid? branchId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourceType);
        ArgumentNullException.ThrowIfNull(withholding);
        if (withholding.Amount <= 0m)
        {
            throw new ArgumentOutOfRangeException(nameof(withholding), "A TDS deduction must be positive.");
        }

        return new TdsDeduction
        {
            Id = Guid.CreateVersion7(),
            SourceType = sourceType,
            SourceId = sourceId,
            DeductionDateUtc = deductionDateUtc,
            VendorName = string.IsNullOrWhiteSpace(vendorName) ? "—" : Cap(vendorName.Trim(), 256),
            Pan = string.IsNullOrWhiteSpace(pan) ? null : Cap(pan.Trim(), 32),
            CategoryCode = Cap(withholding.CategoryCode, TdsCategory.CodeMaxLength),
            CategoryName = Cap(withholding.CategoryName, TdsCategory.NameMaxLength),
            RatePercent = withholding.RatePercent,
            TaxableAmount = withholding.TaxableAmount,
            TdsAmount = withholding.Amount,
            DocumentReference = string.IsNullOrWhiteSpace(documentReference) ? null : Cap(documentReference.Trim(), 128),
            BranchId = branchId,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    private static string Cap(string value, int max) => value.Length <= max ? value : value[..max];
}
