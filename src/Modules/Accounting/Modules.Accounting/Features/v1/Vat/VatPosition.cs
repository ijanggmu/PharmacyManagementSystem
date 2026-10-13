using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vat;

/// <summary>
/// The tenant's net VAT position with IRD, read from the ledger as of an instant:
/// <code>
///   position = (VAT Payable 2100: credits − debits) − (Input VAT 1150: debits − credits)
/// </code>
/// over every ledger voucher (<see cref="LedgerVoucherQueries.LedgerVouchers"/>) dated before
/// <c>beforeUtc</c> — VAT activity AND settlements alike. Output VAT raises it, input VAT lowers it, a VAT
/// payment to IRD (Dr 2100 / Cr Cash-Bank) lowers it, a refund received from IRD (Dr Cash-Bank / Cr 1150 or 2100)
/// raises it, and an input/output set-off journal (Dr 2100 / Cr 1150) leaves it unchanged. So:
/// <list type="bullet">
/// <item><b>position &gt; 0</b> — VAT still owed to IRD (returns filed but not, or not fully, paid);</item>
/// <item><b>position &lt; 0</b> — excess input VAT: a credit carried forward to the next period.</item>
/// </list>
/// </summary>
internal static class VatPosition
{
    public static async Task<decimal> AsOfAsync(
        AccountingDbContext dbContext, DateTime beforeUtc, Guid? branchId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var ids = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == AccountingSystemAccountCodes.VatPayable || a.Code == AccountingSystemAccountCodes.InputVatRecoverable)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (ids.Count == 0)
        {
            return 0m;
        }

        // (2100 credits − debits) − (1150 debits − credits) = credits − debits summed over both accounts.
        // Aggregated in SQL off the entities (no tuple projection — Npgsql can't translate it in a GroupBy).
        var totals = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where ids.Contains(line.AccountId)
                && voucher.VoucherDateUtc < beforeUtc
                && (branchId == null || voucher.BranchId == branchId)
            select new { line.DebitAmount, line.CreditAmount })
            .GroupBy(_ => 1)
            .Select(g => new { Debit = g.Sum(x => x.DebitAmount), Credit = g.Sum(x => x.CreditAmount) })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return totals is null ? 0m : totals.Credit - totals.Debit;
    }
}
