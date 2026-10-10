using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

/// <summary>Quantity/revenue/medicine-count per medicine category over [FromUtc, ToUtc], current-branch
/// scoped, computed over the whole period server-side.</summary>
public sealed record GetCategoryPerformanceQuery(DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null)
    : IQuery<IReadOnlyList<CategoryPerformanceDto>>;
