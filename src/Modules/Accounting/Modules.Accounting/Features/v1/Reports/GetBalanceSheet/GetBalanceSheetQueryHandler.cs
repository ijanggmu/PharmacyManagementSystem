using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetBalanceSheet;

public sealed class GetBalanceSheetQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetBalanceSheetQuery, BalanceSheetDto>
{
    public async ValueTask<BalanceSheetDto> Handle(GetBalanceSheetQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same branch rule as the trial balance: ViewAll callers pick a branch or all; others get theirs.
        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var totals = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where voucher.VoucherDateUtc <= query.AsOfUtc
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
            .Where(a => accountIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, cancellationToken)
            .ConfigureAwait(false);

        var lines = totals
            .Where(t => accounts.ContainsKey(t.AccountId))
            .Select(t =>
            {
                var account = accounts[t.AccountId];
                // Normal-balance sign per account type: Asset/Expense are debit-normal, the rest credit-normal.
                decimal net = account.AccountType is AccountingAccountType.Asset or AccountingAccountType.Expense
                    ? t.TotalDebit - t.TotalCredit
                    : t.TotalCredit - t.TotalDebit;
                return new TrialBalanceLineDto(account.Id, account.Code, account.Name, account.AccountType.ToString(), t.TotalDebit, t.TotalCredit, net);
            })
            .OrderBy(l => l.AccountCode)
            .ToList();

        var assets = Section(lines, AccountingAccountType.Asset);
        var liabilities = Section(lines, AccountingAccountType.Liability);
        var equity = Section(lines, AccountingAccountType.Equity);
        // Closing vouchers are included (dated on or before the as-of date), so revenue and expense hold only the
        // unclosed profit or loss; closed years sit in the Retained Earnings equity account.
        decimal retainedEarnings = equity.Lines
            .Where(l => l.AccountCode == AccountingSystemAccountCodes.RetainedEarnings)
            .Sum(l => l.NetBalance);
        decimal currentEarnings = lines.Where(l => l.AccountType == nameof(AccountingAccountType.Revenue)).Sum(l => l.NetBalance)
            - lines.Where(l => l.AccountType == nameof(AccountingAccountType.Expense)).Sum(l => l.NetBalance);

        bool isBalanced = Math.Abs(assets.Total - (liabilities.Total + equity.Total + currentEarnings)) <= 0.01m;

        return new BalanceSheetDto(query.AsOfUtc, assets, liabilities, equity, currentEarnings, isBalanced, retainedEarnings);
    }

    private static BalanceSheetSectionDto Section(IReadOnlyList<TrialBalanceLineDto> lines, AccountingAccountType type)
    {
        var sectionLines = lines.Where(l => l.AccountType == type.ToString()).ToList();
        return new BalanceSheetSectionDto(sectionLines, sectionLines.Sum(l => l.NetBalance));
    }
}
