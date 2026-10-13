using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLossColumns;

/// <summary>
/// P&amp;L for several periods side by side: one grouped ledger aggregate per period, each with the single-period
/// P&amp;L's rules (<see cref="ProfitAndLossLedger"/>), so every column equals <c>GetProfitAndLoss</c> for its period.
/// An account appears when it has activity in any column; its other columns read zero.
/// </summary>
public sealed class GetProfitAndLossColumnsQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetProfitAndLossColumnsQuery, ProfitAndLossColumnsDto>
{
    public async ValueTask<ProfitAndLossColumnsDto> Handle(GetProfitAndLossColumnsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var perPeriod = new List<Dictionary<Guid, PeriodAccountTotals>>(query.Periods.Count);
        foreach (var period in query.Periods)
        {
            var totals = await ProfitAndLossLedger
                .AccountTotalsAsync(dbContext, period.FromUtc, period.ToUtc, branchFilter, cancellationToken)
                .ConfigureAwait(false);
            perPeriod.Add(totals.ToDictionary(t => t.AccountId));
        }

        var accountIds = perPeriod.SelectMany(p => p.Keys).Distinct().ToList();
        var accounts = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => accountIds.Contains(a.Id)
                && (a.AccountType == AccountingAccountType.Revenue || a.AccountType == AccountingAccountType.Expense))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var lines = accounts
            .OrderBy(a => a.Code, StringComparer.Ordinal)
            .Select(a => new ProfitAndLossColumnsLineDto(
                a.Id,
                a.Code,
                a.Name,
                a.AccountType.ToString(),
                perPeriod.Select(p => p.TryGetValue(a.Id, out var t) ? NormalBalance(a.AccountType, t) : 0m).ToList()))
            .ToList();

        var columns = query.Periods
            .Select((period, i) =>
            {
                decimal revenue = lines.Where(l => l.AccountType == nameof(AccountingAccountType.Revenue)).Sum(l => l.Amounts[i]);
                decimal expense = lines.Where(l => l.AccountType == nameof(AccountingAccountType.Expense)).Sum(l => l.Amounts[i]);
                return new ProfitAndLossColumnDto(period.FromUtc, period.ToUtc, revenue, expense, revenue - expense);
            })
            .ToList();

        return new ProfitAndLossColumnsDto(branchFilter, columns, lines);
    }

    private static decimal NormalBalance(AccountingAccountType type, PeriodAccountTotals totals) =>
        type == AccountingAccountType.Revenue ? totals.TotalCredit - totals.TotalDebit : totals.TotalDebit - totals.TotalCredit;
}
