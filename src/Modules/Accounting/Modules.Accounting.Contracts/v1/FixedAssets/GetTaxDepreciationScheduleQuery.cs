using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>Nepal tax depreciation pool schedule (Income Tax Act 2058, Schedule 2) for the income tax return of fiscal
/// year <paramref name="FiscalYear"/>, tenant-wide (the return is filed per PAN, not per branch).</summary>
public sealed record GetTaxDepreciationScheduleQuery(int FiscalYear) : IQuery<TaxDepreciationScheduleDto>;
