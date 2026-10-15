using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>Posted GL line on a bank statement's reconciled account, within its period — the raw
/// shape shared by the "view" query, auto-match, and complete's outstanding-ledger-lines guard.
/// Mirrors <c>getLedgerLinesForPeriod</c> in the Next.js bank-reconciliation-service.ts.</summary>
public sealed record BankLedgerLine(
    Guid VoucherLineId, Guid VoucherId, string VoucherNo, DateTime VoucherDateUtc,
    string? Description, decimal DebitAmount, decimal CreditAmount);

public static class BankReconciliationLedgerQuery
{
    /// <summary>
    /// The statement period as instants: a statement's start and end are calendar days (stored as their
    /// midnight), and a day means the Nepal business day, so the range runs from the start of the first Nepal
    /// day to the end of the last one. Comparing against the stored midnight would drop every entry posted on
    /// the statement's last day, and catch the evening of the day before its first.
    /// </summary>
    public static (DateTime FromUtc, DateTime ToExclusiveUtc) PeriodRange(DateTime periodStartUtc, DateTime periodEndUtc) =>
        (NepalDate.StartUtc(DateOnly.FromDateTime(periodStartUtc)), NepalDate.EndExclusiveUtc(DateOnly.FromDateTime(periodEndUtc)));

    public static async Task<List<BankLedgerLine>> GetAsync(
        AccountingDbContext dbContext, Guid accountId, DateTime periodStartUtc, DateTime periodEndUtc, Guid? branchId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        var (fromUtc, toExclusiveUtc) = PeriodRange(periodStartUtc, periodEndUtc);
        // A branch's statement reconciles against that branch's bank postings only; an import with no
        // branch (legacy) still sees every branch.
        var rows = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where line.AccountId == accountId
                && voucher.VoucherDateUtc >= fromUtc
                && voucher.VoucherDateUtc < toExclusiveUtc
                && (branchId == null || voucher.BranchId == branchId)
            select new BankLedgerLine(
                line.Id, line.VoucherId, voucher.VoucherNo, voucher.VoucherDateUtc,
                line.Description, line.DebitAmount, line.CreditAmount))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .OrderBy(r => r.VoucherDateUtc)
            .ThenBy(r => r.VoucherNo, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Which of the given GL voucher lines are already claimed by some statement line
    /// (of any import — the uniqueness is global, mirroring the DB's partial unique index on
    /// <c>BankStatementLine.MatchedVoucherLineId</c>). Used to flag ledger candidates as matched
    /// and to compute the "outstanding GL lines" guard on <c>CompleteBankStatementImport</c>.</summary>
    public static async Task<HashSet<Guid>> GetClaimedVoucherLineIdsAsync(
        AccountingDbContext dbContext, IReadOnlyList<Guid> voucherLineIds, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(voucherLineIds);

        if (voucherLineIds.Count == 0)
        {
            return [];
        }

        var claimed = await dbContext.BankStatementLines.AsNoTracking()
            .Where(l => l.MatchedVoucherLineId != null && voucherLineIds.Contains(l.MatchedVoucherLineId.Value))
            .Select(l => l.MatchedVoucherLineId!.Value)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return claimed.ToHashSet();
    }
}
