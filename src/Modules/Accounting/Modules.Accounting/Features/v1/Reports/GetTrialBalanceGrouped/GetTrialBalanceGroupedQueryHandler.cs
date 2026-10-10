using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetTrialBalanceGrouped;

public sealed class GetTrialBalanceGroupedQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetTrialBalanceGroupedQuery, IReadOnlyList<GroupedTrialBalanceLineDto>>
{
    public async ValueTask<IReadOnlyList<GroupedTrialBalanceLineDto>> Handle(
        GetTrialBalanceGroupedQuery query, CancellationToken cancellationToken)
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

        var flat = totals
            .Where(t => accounts.ContainsKey(t.AccountId))
            .Select(t =>
            {
                var account = accounts[t.AccountId];
                return new TrialBalanceLineDto(
                    account.Id, account.Code, account.Name, account.AccountType.ToString(),
                    t.TotalDebit, t.TotalCredit, t.TotalDebit - t.TotalCredit);
            })
            .ToList();

        return TrialBalanceGrouper.Group(flat);
    }
}
