using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.StockTransfers;

/// <summary>LocationId, when set, matches either FromBranchId or ToBranchId (a location is a branch; kept
/// for API compatibility) — mirrors the source system's listStockTransfers "branchId matches from OR to" filter. <see cref="BranchId"/> is the
/// real branch-scoped equivalent of that same filter, matching either FromBranchId or ToBranchId,
/// now that StockTransfer carries both (docs/branch-scoping-plan.md).</summary>
public sealed record SearchStockTransfersQuery(
    Guid? LocationId = null,
    Guid? BranchId = null,
    string? Status = null,
    int PageNumber = 1,
    int PageSize = 20) : IQuery<PagedResponse<StockTransferDto>>;
