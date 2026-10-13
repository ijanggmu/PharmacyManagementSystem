using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>Book depreciation schedule (per asset, per month) of fiscal year <paramref name="FiscalYear"/>.</summary>
public sealed record GetDepreciationScheduleQuery(int FiscalYear, Guid? BranchId = null) : IQuery<DepreciationScheduleDto>;
