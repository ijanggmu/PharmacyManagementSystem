using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// Paged medicine list. Ported from GET app/api/medicines (parseListMedicinesInput + listMedicinesForTenant).
/// </summary>
/// <remarks>
/// StockStatuses: any of "in", "low", "out" (total on-hand vs reorder level).
/// ExpiryStatuses: any of "expiring" (within 30 days), "expired" (nearest batch expiry passed).
/// Stock and expiry filters are evaluated against batch aggregates, so the handler filters in memory (capped, like the legacy route).
/// SortBy: name (default), quantity, expiry, price, updated. SortOrder: asc (default) or desc. Quantity and expiry
/// are batch aggregates, so they sort in memory; expiry puts medicines with no expiry last in either direction.
/// </remarks>
public sealed record SearchMedicinesQuery(
    string? Search = null,
    Guid? CategoryId = null,
    bool? BelowReorderLevel = null,
    int PageNumber = 1,
    int PageSize = 50,
    Guid? SupplierId = null,
    bool IncludeArchived = false,
    IReadOnlyList<Guid>? CategoryIds = null,
    IReadOnlyList<string>? StockStatuses = null,
    IReadOnlyList<string>? ExpiryStatuses = null,
    string? SortBy = null,
    string? SortOrder = null,
    // Branch whose stock the figures, stock/expiry filters and FEFO picks use. ViewAll callers may pick
    // any branch (null = all branches combined); everyone else is confined to their own branch.
    Guid? BranchId = null) : IQuery<PagedResponse<MedicineDto>>;
