using FSH.Framework.Core.Domain;

namespace FSH.Modules.Sales.Domain;

/// <summary>IRD document series that each keep their own sequence.</summary>
public static class InvoiceSeries
{
    public const string Invoice = "INV";
    public const string CreditNote = "CN";
}

/// <summary>
/// One counter per (tenant, branch, series, fiscal year): numbers restart at 1 every 1 Shrawan and run
/// separately per branch and per document series ("INV" invoices, "CN" credit notes). Incremented atomically by <c>InvoiceNumberService</c> via a single
/// <c>UPDATE ... RETURNING</c> on the sale's own transaction — the same pattern as
/// <c>PrescriptionNumberSequence</c>, so a rolled-back sale also rolls back its number (no gaps).
/// </summary>
public sealed class InvoiceNumberSequence : AggregateRoot<Guid>
{
    public Guid BranchId { get; private set; }

    /// <summary>Document series: <see cref="InvoiceSeries.Invoice"/> or <see cref="InvoiceSeries.CreditNote"/>.</summary>
    public string Series { get; private set; } = InvoiceSeries.Invoice;

    /// <summary>BS year the fiscal year started in (2083 for FY 2083/84).</summary>
    public int FiscalYear { get; private set; }

    public int LastNumber { get; private set; }

    private InvoiceNumberSequence() { }

    /// <summary>Production rows are inserted by InvoiceNumberService's upsert; this exists for seeding/tests.</summary>
    public static InvoiceNumberSequence Create(Guid branchId, int fiscalYear, string series = InvoiceSeries.Invoice) => new()
    {
        Id = Guid.CreateVersion7(),
        BranchId = branchId,
        Series = series,
        FiscalYear = fiscalYear,
        LastNumber = 0,
    };
}
