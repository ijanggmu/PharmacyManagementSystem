using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Sales.Contracts.Fiscal;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Year-end close for a Nepali fiscal year (1 Shrawan – end of Ashadh).
/// <para>
/// <b>Close</b>: for every branch, the cumulative balance of each revenue and expense account up to the end of the
/// year is reversed out by one closing voucher (<see cref="FiscalYearCloseRules.VoucherType"/>, JV series, dated the
/// year's last instant in Nepal time) whose balancing line goes to Retained Earnings
/// (<see cref="AccountingSystemAccountCodes.RetainedEarnings"/>). One voucher per branch because every report scopes
/// by the voucher's branch: per-branch balance sheets then show that branch's own retained earnings. The close is
/// recorded (<see cref="FiscalYearClose"/>, unique per year) and the posting lock moves to at least the year's last
/// day, all in one transaction. The closing voucher is the one entry allowed into an already locked period — it is
/// what closes it.
/// </para>
/// <para>
/// <b>Reopen</b>: only the latest closed year. Its closing vouchers are reversed on their own date (so the year's
/// revenue and expense balances come back and Retained Earnings drops) and the close record is deleted. The posting
/// lock is left alone; the user moves it to post into the year again.
/// </para>
/// </summary>
public sealed partial class FiscalYearCloseService(
    AccountingDbContext dbContext,
    IAccountingVoucherNumbers voucherNumbers,
    AccountingPostingLockService postingLockService,
    TimeProvider timeProvider,
    ILogger<FiscalYearCloseService> logger)
{
    /// <summary>The instant a closing voucher carries: the last millisecond of the year's last Nepal day. It is on the
    /// inclusive end bound reports use for that day, and after every ordinary voucher of the day.</summary>
    public static DateTime ClosingInstantUtc(DateOnly lastDay) => NepalDate.EndExclusiveUtc(lastDay).AddMilliseconds(-1);

    private DateOnly TodayInNepal => NepalDate.FromUtc(timeProvider.GetUtcNow().UtcDateTime);

    public async Task<IReadOnlyList<FiscalYearStatusDto>> ListAsync(CancellationToken cancellationToken = default)
    {
        int currentYear = NepalFiscalYear.StartYearFor(timeProvider.GetUtcNow().UtcDateTime);

        DateTime? firstVoucher = await dbContext.LedgerVouchers()
            .OrderBy(v => v.VoucherDateUtc)
            .Select(v => (DateTime?)v.VoucherDateUtc)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        var closes = await dbContext.FiscalYearCloses
            .AsNoTracking()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var closingVouchers = await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => v.VoucherType == FiscalYearCloseRules.VoucherType && v.Status == AccountingVoucherStatus.Posted)
            .Select(v => new { v.VoucherNo, v.VoucherDateUtc })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int firstYear = Math.Min(firstVoucher is { } first ? FiscalYearOf(first) : currentYear, currentYear);
        if (closes.Count > 0)
        {
            firstYear = Math.Min(firstYear, closes.Min(c => c.FiscalYear));
        }

        DateOnly today = TodayInNepal;
        var years = new List<FiscalYearStatusDto>();
        for (int year = currentYear; year >= firstYear; year--)
        {
            var (start, end) = NepalFiscalYear.Range(year);
            var close = closes.FirstOrDefault(c => c.FiscalYear == year);
            IReadOnlyList<string> voucherNos = close is null
                ? []
                : closingVouchers
                    .Where(v => NepalDate.FromUtc(v.VoucherDateUtc) == end)
                    .Select(v => v.VoucherNo)
                    .Order(StringComparer.Ordinal)
                    .ToList();
            years.Add(new FiscalYearStatusDto(
                year, NepalFiscalYear.Label(year), start, end, end < today, close is not null,
                close?.ClosedAtUtc, close?.ClosedBy, close?.NetProfit, voucherNos));
        }

        return years;
    }

    public async Task<FiscalYearCloseResultDto> CloseAsync(int fiscalYear, string closedBy, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(closedBy);

        var (start, end) = NepalFiscalYear.Range(fiscalYear);
        string label = NepalFiscalYear.Label(fiscalYear);
        if (end >= TodayInNepal)
        {
            throw Conflict($"Fiscal year {label} has not ended yet (it runs to {end:yyyy-MM-dd}). A year can be closed from the day after its last day.");
        }

        if (await dbContext.FiscalYearCloses.AnyAsync(c => c.FiscalYear == fiscalYear, cancellationToken).ConfigureAwait(false))
        {
            throw Conflict($"Fiscal year {label} is already closed.");
        }

        await EnsureEarlierYearsClosedAsync(fiscalYear, start, cancellationToken).ConfigureAwait(false);

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            var lockRow = await postingLockService.GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
            Guid retainedEarningsId = await GetOrCreateRetainedEarningsAccountAsync(cancellationToken).ConfigureAwait(false);
            DateTime closingInstant = ClosingInstantUtc(end);
            DateTime endExclusive = NepalDate.EndExclusiveUtc(end);

            // Cumulative (all history up to the year end) rather than this year's movement: with every earlier year
            // closed the two are equal, and this way each revenue and expense account is guaranteed to read zero at
            // the year end. Grouped by the voucher's branch — the branch every report filters on.
            var balances = await (
                from line in dbContext.VoucherLines.AsNoTracking()
                join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
                join account in dbContext.Accounts.AsNoTracking() on line.AccountId equals account.Id
                where voucher.VoucherDateUtc < endExclusive
                    && (account.AccountType == AccountingAccountType.Revenue || account.AccountType == AccountingAccountType.Expense)
                group line by new { voucher.BranchId, line.AccountId } into g
                select new
                {
                    g.Key.BranchId,
                    g.Key.AccountId,
                    TotalDebit = g.Sum(l => l.DebitAmount),
                    TotalCredit = g.Sum(l => l.CreditAmount),
                })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            var voucherIds = new List<Guid>();
            decimal netProfit = 0m;
            foreach (var branch in balances.GroupBy(b => b.BranchId).OrderBy(g => g.Key))
            {
                var (lines, branchProfit) = FiscalYearCloseRules.BuildClosingLines(
                    branch.Select(b => new ProfitAndLossBalance(b.AccountId, b.TotalDebit, b.TotalCredit)), retainedEarningsId);
                if (lines.Count == 0)
                {
                    continue;
                }

                var voucher = AccountingVoucher.CreateDraft(
                    closingInstant, FiscalYearCloseRules.VoucherType, AccountingVoucherSource.System,
                    $"Year-end close {label}: revenue and expense balances transferred to Retained Earnings",
                    FiscalYearCloseRules.ReferenceType, referenceId: null, branchId: branch.Key);
                string netDescription = branchProfit >= 0m ? $"Net profit {label}" : $"Net loss {label}";
                foreach (var line in lines)
                {
                    voucher.AddLine(
                        line.AccountId,
                        line.AccountId == retainedEarningsId ? netDescription : $"Close {label}",
                        line.DebitAmount, line.CreditAmount);
                }

                string series = VoucherSeries.ForVoucherType(voucher.VoucherType);
                int number = await voucherNumbers.ReserveNextNumberAsync(series, cancellationToken).ConfigureAwait(false);
                voucher.Post(VoucherSeries.Format(series, number), closedBy);
                dbContext.Vouchers.Add(voucher);
                voucherIds.Add(voucher.Id);
                netProfit += branchProfit;
            }

            var close = FiscalYearClose.Create(fiscalYear, start, end, netProfit, voucherIds.Count, closedBy);
            dbContext.FiscalYearCloses.Add(close);

            // Nothing may post into the closed year afterwards. Never moves an existing later lock back.
            if (lockRow.LockDate is not { } locked || locked < end)
            {
                var lockChange = lockRow.SetLockDate(end, closedBy);
                if (lockChange is not null)
                {
                    dbContext.PostingLockChanges.Add(lockChange);
                }
            }

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (DbUpdateException ex)
            {
                // The unique (tenant, fiscal year) index: another request closed the same year concurrently.
                throw new CustomException($"Fiscal year {label} was closed concurrently. Refresh to see it.", ex, HttpStatusCode.Conflict);
            }

            LogFiscalYearClosed(logger, label, voucherIds.Count, netProfit, closedBy);
            return new FiscalYearCloseResultDto(
                fiscalYear, label, end, netProfit, voucherIds, lockRow.LockDate, close.ClosedAtUtc, close.ClosedBy);
        }, cancellationToken).ConfigureAwait(false);
    }

    public async Task<FiscalYearReopenResultDto> ReopenAsync(int fiscalYear, string reopenedBy, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reopenedBy);

        var (start, end) = NepalFiscalYear.Range(fiscalYear);
        string label = NepalFiscalYear.Label(fiscalYear);

        var close = await dbContext.FiscalYearCloses
            .FirstOrDefaultAsync(c => c.FiscalYear == fiscalYear, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Fiscal year {label} is not closed.");

        int? laterClosed = await dbContext.FiscalYearCloses
            .Where(c => c.FiscalYear > fiscalYear)
            .OrderBy(c => c.FiscalYear)
            .Select(c => (int?)c.FiscalYear)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (laterClosed is { } later)
        {
            throw Conflict($"Fiscal year {NepalFiscalYear.Label(later)} is closed too. Reopen the later year first.");
        }

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            DateTime from = NepalDate.StartUtc(start);
            DateTime toExclusive = NepalDate.EndExclusiveUtc(end);
            var closingVouchers = await dbContext.Vouchers
                .Include(v => v.Lines)
                .Where(v => v.VoucherType == FiscalYearCloseRules.VoucherType
                    && v.Status == AccountingVoucherStatus.Posted
                    && v.VoucherDateUtc >= from && v.VoucherDateUtc < toExclusive)
                .OrderBy(v => v.VoucherNo)
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            var reversalIds = new List<Guid>();
            foreach (var voucher in closingVouchers)
            {
                // Dated on the closing voucher's own instant, so the pair nets to zero inside the year.
                int number = await voucherNumbers.ReserveNextNumberAsync(VoucherSeries.Reversal, cancellationToken).ConfigureAwait(false);
                var reversal = voucher.CreateReversal(
                    VoucherSeries.Format(VoucherSeries.Reversal, number), reopenedBy, voucher.VoucherDateUtc, $"fiscal year {label} reopened");
                dbContext.Vouchers.Add(reversal);
                reversalIds.Add(reversal.Id);
            }

            dbContext.FiscalYearCloses.Remove(close);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            var lockRow = await postingLockService.GetOrCreateAsync(cancellationToken).ConfigureAwait(false);
            LogFiscalYearReopened(logger, label, reversalIds.Count, reopenedBy);
            return new FiscalYearReopenResultDto(fiscalYear, label, reversalIds, lockRow.LockDate);
        }, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Refuses to close <paramref name="fiscalYear"/> while an earlier year that has revenue or expense postings is
    /// still open: its profit would otherwise be swept into this year's close and never be reported as its own.
    /// </summary>
    private async Task EnsureEarlierYearsClosedAsync(int fiscalYear, DateOnly start, CancellationToken cancellationToken)
    {
        DateTime startUtc = NepalDate.StartUtc(start);
        var profitAndLossLines =
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            join account in dbContext.Accounts.AsNoTracking() on line.AccountId equals account.Id
            where account.AccountType == AccountingAccountType.Revenue || account.AccountType == AccountingAccountType.Expense
            select voucher.VoucherDateUtc;

        DateTime? earliest = await profitAndLossLines
            .Where(d => d < startUtc)
            .OrderBy(d => d)
            .Select(d => (DateTime?)d)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (earliest is not { } first)
        {
            return;
        }

        var closedYears = await dbContext.FiscalYearCloses
            .AsNoTracking()
            .Select(c => c.FiscalYear)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        for (int year = FiscalYearOf(first); year < fiscalYear; year++)
        {
            if (closedYears.Contains(year))
            {
                continue;
            }

            var (yearStart, yearEnd) = NepalFiscalYear.Range(year);
            DateTime from = NepalDate.StartUtc(yearStart);
            DateTime toExclusive = NepalDate.EndExclusiveUtc(yearEnd);
            if (await profitAndLossLines.AnyAsync(d => d >= from && d < toExclusive, cancellationToken).ConfigureAwait(false))
            {
                throw Conflict(
                    $"Fiscal year {NepalFiscalYear.Label(year)} has revenue or expense postings and is still open. " +
                    $"Close it before {NepalFiscalYear.Label(fiscalYear)}.");
            }
        }
    }

    /// <summary>
    /// The system Retained Earnings account. Seeded by <c>AccountingDbInitializer</c>; for a tenant whose seed has not
    /// run since it was added, it is created here under the Equity head and saved with the closing vouchers.
    /// </summary>
    private async Task<Guid> GetOrCreateRetainedEarningsAccountAsync(CancellationToken cancellationToken)
    {
        const string code = AccountingSystemAccountCodes.RetainedEarnings;
        var existing = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == code)
            .Select(a => new { a.Id, a.IsSystem, a.AccountType })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (existing is { IsSystem: true, AccountType: AccountingAccountType.Equity })
        {
            return existing.Id;
        }

        if (existing is not null)
        {
            throw Conflict(
                $"Account code {code} is used by another account, so the system Retained Earnings account can't be created. " +
                "Change that account's code, then retry.");
        }

        string equityRootCode = AccountingAccount.RootHeads[AccountingAccountType.Equity].Code;
        Guid? equityRoot = await dbContext.Accounts
            .Where(a => a.ParentId == null && a.IsSystem && a.Code == equityRootCode)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        var account = AccountingAccount.Create(code, "Retained Earnings", AccountingAccountType.Equity, isSystem: true, parentId: equityRoot);
        dbContext.Accounts.Add(account);
        return account.Id;
    }

    /// <summary>The fiscal year an instant falls in; instants before the fiscal-year table count as its first year.</summary>
    private static int FiscalYearOf(DateTime utc) =>
        NepalDate.FromUtc(utc) < NepalFiscalYear.Range(NepalFiscalYear.FirstStartYear).Start
            ? NepalFiscalYear.FirstStartYear
            : NepalFiscalYear.StartYearFor(utc);

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Accounting] fiscal year {FiscalYear} closed by {ClosedBy}: {VoucherCount} closing vouchers, net profit {NetProfit}")]
    private static partial void LogFiscalYearClosed(ILogger logger, string fiscalYear, int voucherCount, decimal netProfit, string closedBy);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Accounting] fiscal year {FiscalYear} reopened by {ReopenedBy}: {ReversalCount} closing vouchers reversed")]
    private static partial void LogFiscalYearReopened(ILogger logger, string fiscalYear, int reversalCount, string reopenedBy);
}
