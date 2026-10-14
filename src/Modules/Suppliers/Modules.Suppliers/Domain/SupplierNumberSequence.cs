using FSH.Framework.Core.Domain;

namespace FSH.Modules.Suppliers.Domain;

/// <summary>Supplier document series that each keep their own sequence.</summary>
public static class SupplierSeries
{
    /// <summary>Debit notes for goods returned to suppliers.</summary>
    public const string DebitNote = "DN";

    /// <summary>Payments made to suppliers (the payment voucher number).</summary>
    public const string Payment = "SPM";
}

/// <summary>
/// One counter per (tenant, branch, series, fiscal year): debit-note numbers restart every 1 Shrawan
/// and run separately per branch, incremented atomically with <c>UPDATE ... RETURNING</c> on the
/// return's own transaction (same pattern as the Sales invoice and Customers receipt series).
/// </summary>
public sealed class SupplierNumberSequence : AggregateRoot<Guid>
{
    public Guid BranchId { get; private set; }
    public string Series { get; private set; } = SupplierSeries.DebitNote;
    public int FiscalYear { get; private set; }
    public int LastNumber { get; private set; }

    private SupplierNumberSequence() { }

    /// <summary>Production rows are inserted by the numbering service's upsert; this exists for seeding/tests.</summary>
    public static SupplierNumberSequence Create(Guid branchId, int fiscalYear, string series = SupplierSeries.DebitNote) => new()
    {
        Id = Guid.CreateVersion7(),
        BranchId = branchId,
        Series = series,
        FiscalYear = fiscalYear,
        LastNumber = 0,
    };
}
