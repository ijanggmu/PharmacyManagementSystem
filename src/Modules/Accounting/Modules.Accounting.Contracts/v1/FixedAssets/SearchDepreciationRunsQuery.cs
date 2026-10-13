using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>Depreciation runs posted for fiscal year <paramref name="FiscalYear"/> (null = all), newest first.</summary>
public sealed record SearchDepreciationRunsQuery(int? FiscalYear = null, Guid? BranchId = null)
    : IQuery<IReadOnlyList<DepreciationRunDto>>;
