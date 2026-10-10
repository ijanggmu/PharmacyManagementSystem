using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Reports;

/// <summary>
/// Per-medicine quantity and revenue for completed sales in [FromUtc, ToUtc], current-branch scoped
/// (see ICurrentBranch). Medicines with no sales in the window are absent from the result.
/// Internal cross-module query — no HTTP endpoint of its own; consumed by Inventory's top-selling-medicines
/// and category-performance reports so Inventory never touches SalesDbContext directly.
/// </summary>
public sealed record GetMedicineSalesAggregateQuery(DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null)
    : IQuery<IReadOnlyDictionary<Guid, MedicineSalesAggregateDto>>;
