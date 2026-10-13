using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;

public sealed class GetProfitAndLossQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetProfitAndLossQuery, ProfitAndLossDto>
{
    public async ValueTask<ProfitAndLossDto> Handle(GetProfitAndLossQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same branch rule as the trial balance: ViewAll callers pick a branch or all; others get theirs.
        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        // Year-end closing entries (and reversals of them) are left out: they zero revenue and expense into
        // Retained Earnings, and a closed year must still report its real figures.
        var totals = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers().ExcludingYearEndClose(dbContext) on line.VoucherId equals voucher.Id
            where voucher.VoucherDateUtc >= query.FromUtc
                && voucher.VoucherDateUtc <= query.ToUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            group line by line.AccountId into g
            select new
            {
                AccountId = g.Key,
                TotalDebit = g.Sum(l => l.DebitAmount),
                TotalCredit = g.Sum(l => l.CreditAmount),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var accountIds = totals.Select(t => t.AccountId).ToList();
        var accounts = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => accountIds.Contains(a.Id)
                && (a.AccountType == AccountingAccountType.Revenue || a.AccountType == AccountingAccountType.Expense))
            .ToDictionaryAsync(a => a.Id, cancellationToken)
            .ConfigureAwait(false);

        var lines = totals
            .Where(t => accounts.ContainsKey(t.AccountId))
            .Select(t =>
            {
                var account = accounts[t.AccountId];
                decimal net = account.AccountType == AccountingAccountType.Revenue
                    ? t.TotalCredit - t.TotalDebit
                    : t.TotalDebit - t.TotalCredit;
                return new TrialBalanceLineDto(account.Id, account.Code, account.Name, account.AccountType.ToString(), t.TotalDebit, t.TotalCredit, net);
            })
            .OrderBy(l => l.AccountCode)
            .ToList();

        var revenueLines = lines.Where(l => l.AccountType == nameof(AccountingAccountType.Revenue)).ToList();
        var expenseLines = lines.Where(l => l.AccountType == nameof(AccountingAccountType.Expense)).ToList();
        decimal totalRevenue = revenueLines.Sum(l => l.NetBalance);
        decimal totalExpense = expenseLines.Sum(l => l.NetBalance);

        return new ProfitAndLossDto(query.FromUtc, query.ToUtc, revenueLines, totalRevenue, expenseLines, totalExpense, totalRevenue - totalExpense);
    }
}
