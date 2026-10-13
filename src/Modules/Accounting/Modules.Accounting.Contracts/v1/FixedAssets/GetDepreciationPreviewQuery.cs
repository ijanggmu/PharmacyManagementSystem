using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>What <see cref="RunDepreciationCommand"/> would post for fiscal year <paramref name="FiscalYear"/> (BS
/// start year, e.g. 2083 for 2083/84): one month (<paramref name="Month"/> 1 = Shrawan … 12 = Ashadh) or the whole year
/// (null). Nothing is posted.</summary>
public sealed record GetDepreciationPreviewQuery(int FiscalYear, int? Month = null, Guid? BranchId = null)
    : IQuery<DepreciationPreviewDto>;
