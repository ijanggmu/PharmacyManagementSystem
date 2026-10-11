using FSH.Modules.Accounting.Contracts.Dtos;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// Pure grouping step for the grouped trial balance report — rolls flat per-account lines up by
/// <c>AccountType</c>. Kept separate from <c>GetTrialBalanceGroupedQueryHandler</c> (which owns the
/// DB query) so the rollup math is unit-testable without a DbContext.
/// </summary>
public static class TrialBalanceGrouper
{
    public static IReadOnlyList<GroupedTrialBalanceLineDto> Group(IReadOnlyList<TrialBalanceLineDto> flatLines)
    {
        ArgumentNullException.ThrowIfNull(flatLines);

        return flatLines
            .GroupBy(l => l.AccountType, StringComparer.Ordinal)
            .Select(g =>
            {
                var accounts = g.OrderBy(a => a.AccountCode, StringComparer.Ordinal).ToList();
                decimal debit = accounts.Sum(a => a.TotalDebit);
                decimal credit = accounts.Sum(a => a.TotalCredit);
                return new GroupedTrialBalanceLineDto(g.Key, debit, credit, debit - credit, accounts);
            })
            .OrderBy(g => g.AccountType, StringComparer.Ordinal)
            .ToList();
    }
}
