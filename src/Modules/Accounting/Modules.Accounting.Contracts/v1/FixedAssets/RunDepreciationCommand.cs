using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>
/// Posts book depreciation for fiscal year <paramref name="FiscalYear"/>: one month (<paramref name="Month"/> 1 =
/// Shrawan … 12 = Ashadh) or the whole year (null). One <c>system_depreciation</c> voucher (JV series) per branch, dated
/// the period's last day: Dr Depreciation Expense 5350 / Cr Accumulated Depreciation 1590. Idempotent per asset and
/// month — months already posted are skipped, so running a period twice posts nothing the second time. The period must
/// have ended and lie after the posting-lock date.
/// </summary>
public sealed record RunDepreciationCommand(int FiscalYear, int? Month = null, Guid? BranchId = null)
    : ICommand<DepreciationRunResultDto>;
