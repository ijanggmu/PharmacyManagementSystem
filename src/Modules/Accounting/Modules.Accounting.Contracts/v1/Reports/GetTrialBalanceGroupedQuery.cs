using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Same figures as <see cref="GetTrialBalanceQuery"/>, rolled up by account type/category
/// rather than listed flat per account — the "grouped" variant of the Next.js
/// <c>trial-balance-grouped</c> report (the .NET chart of accounts has no parent-account
/// hierarchy, so the grouping dimension here is <c>AccountType</c> rather than the Next.js
/// version's ad hoc "roll AP sub-accounts under 2100" rule).</summary>
public sealed record GetTrialBalanceGroupedQuery(DateTime AsOfUtc, Guid? BranchId = null) : IQuery<IReadOnlyList<GroupedTrialBalanceLineDto>>;
