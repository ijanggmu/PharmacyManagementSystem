using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// The record that a Nepali fiscal year (1 Shrawan – end of Ashadh) has been closed: its revenue and expense
/// balances were transferred to Retained Earnings by one closing voucher per branch
/// (<see cref="FiscalYearCloseRules.VoucherType"/>, dated the year's last day). One row per tenant and fiscal
/// year — the unique index makes a concurrent second close fail instead of posting twice. Reopening the year
/// reverses the closing vouchers and deletes this row.
/// </summary>
public sealed class FiscalYearClose : AggregateRoot<Guid>
{
    /// <summary>BS year the fiscal year started in, e.g. 2082 for 2082/83.</summary>
    public int FiscalYear { get; private set; }

    /// <summary>First and last Nepal calendar day (AD) of the fiscal year.</summary>
    public DateOnly PeriodStart { get; private set; }
    public DateOnly PeriodEnd { get; private set; }

    /// <summary>Net profit (loss when negative) transferred to Retained Earnings, all branches together.</summary>
    public decimal NetProfit { get; private set; }

    /// <summary>Closing vouchers posted (one per branch with revenue or expense balances; 0 for a year without any).</summary>
    public int VoucherCount { get; private set; }

    public DateTime ClosedAtUtc { get; private set; }
    public string ClosedBy { get; private set; } = default!;

    private FiscalYearClose() { }

    public static FiscalYearClose Create(
        int fiscalYear, DateOnly periodStart, DateOnly periodEnd, decimal netProfit, int voucherCount, string closedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(closedBy);
        if (periodEnd < periodStart)
        {
            throw new ArgumentException("The period end can't be before its start.", nameof(periodEnd));
        }

        return new FiscalYearClose
        {
            Id = Guid.CreateVersion7(),
            FiscalYear = fiscalYear,
            PeriodStart = periodStart,
            PeriodEnd = periodEnd,
            NetProfit = netProfit,
            VoucherCount = voucherCount,
            ClosedAtUtc = DateTime.UtcNow,
            ClosedBy = closedBy.Trim(),
        };
    }
}
