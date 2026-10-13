using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;

/// <summary>Gross debit and credit of one account over a period.</summary>
internal sealed record PeriodAccountTotals(Guid AccountId, decimal TotalDebit, decimal TotalCredit);

/// <summary>
/// The P&amp;L's ledger query, shared by the single-period P&amp;L and the multi-period columns so every column
/// follows the same rules: ledger vouchers in [from, to], branch-filtered, without year-end closing entries (and
/// reversals of them) — they zero revenue and expense into Retained Earnings, and a closed year must still report
/// its real figures.
/// </summary>
internal static class ProfitAndLossLedger
{
    public static Task<List<PeriodAccountTotals>> AccountTotalsAsync(
        AccountingDbContext dbContext, DateTime fromUtc, DateTime toUtc, Guid? branchFilter, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        return (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers().ExcludingYearEndClose(dbContext) on line.VoucherId equals voucher.Id
            where voucher.VoucherDateUtc >= fromUtc
                && voucher.VoucherDateUtc <= toUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            group line by line.AccountId into g
            select new PeriodAccountTotals(g.Key, g.Sum(l => l.DebitAmount), g.Sum(l => l.CreditAmount)))
            .ToListAsync(cancellationToken);
    }
}
