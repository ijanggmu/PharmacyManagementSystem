using FSH.Framework.Core.Domain;

namespace FSH.Modules.Purchasing.Domain;

/// <summary>Purchasing document series that each keep their own sequence.</summary>
public static class PurchasingSeries
{
    /// <summary>Direct and bulk-import goods receipts (no purchase order).</summary>
    public const string GoodsReceipt = "GRN";
}

/// <summary>
/// One counter per (tenant, branch, series, fiscal year): numbers restart at 1 every 1 Shrawan and run
/// separately per branch. Incremented atomically by <c>ReceiptNumberService</c> with a single
/// <c>UPDATE ... RETURNING</c> on the receipt's own transaction — the same pattern as the Sales
/// <c>InvoiceNumberSequence</c>, so a rolled-back receipt also rolls back its number (no gaps).
/// </summary>
public sealed class PurchasingNumberSequence : AggregateRoot<Guid>
{
    public Guid BranchId { get; private set; }

    public string Series { get; private set; } = PurchasingSeries.GoodsReceipt;

    /// <summary>BS year the fiscal year started in (2083 for FY 2083/84).</summary>
    public int FiscalYear { get; private set; }

    public int LastNumber { get; private set; }

    private PurchasingNumberSequence() { }

    /// <summary>Production rows are inserted by ReceiptNumberService's upsert; this exists for seeding/tests.</summary>
    public static PurchasingNumberSequence Create(Guid branchId, int fiscalYear, string series = PurchasingSeries.GoodsReceipt) => new()
    {
        Id = Guid.CreateVersion7(),
        BranchId = branchId,
        Series = series,
        FiscalYear = fiscalYear,
        LastNumber = 0,
    };
}
