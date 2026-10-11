using FSH.Framework.Core.Domain;

namespace FSH.Modules.Customers.Domain;

/// <summary>Customer document series that each keep their own sequence.</summary>
public static class CustomerSeries
{
    /// <summary>Receipts for money received from customers.</summary>
    public const string Receipt = "RCP";
}

/// <summary>
/// One counter per (tenant, branch, series, fiscal year): receipt numbers restart at 1 every 1 Shrawan and run
/// separately per branch. Incremented atomically by <c>CustomerReceiptNumberService</c> with a single
/// <c>UPDATE ... RETURNING</c> on the payment's own transaction (same pattern as the Sales invoice series),
/// so a rolled-back payment also rolls back its number.
/// </summary>
public sealed class CustomerNumberSequence : AggregateRoot<Guid>
{
    public Guid BranchId { get; private set; }

    public string Series { get; private set; } = CustomerSeries.Receipt;

    /// <summary>BS year the fiscal year started in (2083 for FY 2083/84).</summary>
    public int FiscalYear { get; private set; }

    public int LastNumber { get; private set; }

    private CustomerNumberSequence() { }

    /// <summary>Production rows are inserted by the numbering service's upsert; this exists for seeding/tests.</summary>
    public static CustomerNumberSequence Create(Guid branchId, int fiscalYear, string series = CustomerSeries.Receipt) => new()
    {
        Id = Guid.CreateVersion7(),
        BranchId = branchId,
        Series = series,
        FiscalYear = fiscalYear,
        LastNumber = 0,
    };
}
