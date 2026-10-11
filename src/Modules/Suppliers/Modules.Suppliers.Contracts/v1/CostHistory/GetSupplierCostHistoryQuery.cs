using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.CostHistory;

/// <summary>Historical unit cost per medicine over time for one supplier — ports
/// <c>getSupplierCostHistory</c> (supplier-cost-history-service.ts). Not paginated (a bounded
/// <paramref name="Limit"/> instead), matching the source it ports.</summary>
public sealed record GetSupplierCostHistoryQuery(Guid SupplierId, int Limit = 200)
    : IQuery<IReadOnlyList<SupplierCostHistoryDto>>;
