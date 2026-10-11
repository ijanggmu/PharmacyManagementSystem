using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Consignment;

/// <summary>
/// Newest-first settlement history, optionally for one supplier — real server-side paging via
/// <see cref="PageNumber"/>/<see cref="PageSize"/> (same shape as <c>ListConsignmentPositionsQuery</c>).
/// Replaces the former <c>Limit</c> cap, which had no other callers.
/// </summary>
public sealed record ListConsignmentSettlementsQuery(Guid? SupplierId = null, int PageNumber = 1, int PageSize = 50, Guid? BranchId = null)
    : IQuery<PagedResponse<ConsignmentSettlementDto>>;
