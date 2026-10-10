using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Sums debit/credit across all POSTED voucher lines up to (and including) <paramref name="AsOfUtc"/>.
/// <paramref name="BranchId"/> optionally narrows to one branch's voucher lines; omitted/null returns
/// the tenant-wide total (docs/branch-scoping-plan.md §2 — same optional-filter shape as the Next.js
/// <c>accounting_opening_balance(p_branch_id UUID DEFAULT NULL)</c>).</summary>
public sealed record GetTrialBalanceQuery(DateTime AsOfUtc, Guid? BranchId = null) : IQuery<IReadOnlyList<TrialBalanceLineDto>>;
