using FSH.Framework.Shared.Persistence;
using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;

/// <summary>Goods receipts (every delivery: supplier bills, purchase orders, stock entries), newest first (receipt date, then created-at) — mirrors
/// listDirectGoodsReceipts (lib/server/services/inventory-supplier-receipt-service.ts): these never appear in
/// SearchPurchaseOrders since they have no purchase order, so the Purchases surface needs this separate feed.
/// Paged on the server (<see cref="PagedResponse{T}.TotalCount"/> is the full count), so older receipts stay
/// reachable. <paramref name="BranchId"/> is an optional filter, mirroring other branch-scoped list/report
/// endpoints (docs/branch-scoping-plan.md §2) — omitted, it defaults to the caller's branch (all branches for a
/// caller who may see every branch). <paramref name="Status"/> is <c>Received</c> or <c>Voided</c> (any
/// casing); <paramref name="Search"/> matches the receipt number, the supplier's invoice number, the supplier
/// name or the purchase order number. <paramref name="DateFromUtc"/>/<paramref name="DateToUtc"/> bound the
/// receipt date (inclusive); <paramref name="Source"/> is <c>SupplierBill</c>, <c>PurchaseOrder</c> or
/// <c>StockEntry</c> (any casing).</summary>
public sealed record ListDirectGoodsReceiptsQuery(
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? Status = null,
    string? Search = null,
    Guid? SupplierId = null,
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    string? Source = null)
    : IQuery<PagedResponse<DirectGoodsReceiptDto>>
{
    public const int MaxPageSize = 200;
}
