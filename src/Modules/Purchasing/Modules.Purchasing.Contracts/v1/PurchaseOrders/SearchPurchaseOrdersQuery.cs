using FSH.Framework.Shared.Persistence;
using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Paged purchase orders, newest first.
/// <see cref="Status"/> is one status or a comma-separated list (Draft, Approved, Received, Cancelled),
/// e.g. "Draft,Approved" for every open order. <see cref="Search"/> matches the supplier name, the start
/// of the order id, the supplier invoice number or the narration (case-insensitive).
/// </summary>
public sealed record SearchPurchaseOrdersQuery(
    Guid? SupplierId = null,
    string? Status = null,
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? Search = null,
    // Ordering branch; null = all branches the caller may see (pinned callers: their own).
    Guid? BranchId = null) : IQuery<PagedResponse<PurchaseOrderDto>>;
