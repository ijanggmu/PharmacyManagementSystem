using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.CashShifts;

/// <summary>Expected drawer cash per branch, for branches that currently have an open shift. Tenant-wide.</summary>
public sealed record GetBranchCashSummaryQuery : IQuery<IReadOnlyList<BranchCashSummaryDto>>;
