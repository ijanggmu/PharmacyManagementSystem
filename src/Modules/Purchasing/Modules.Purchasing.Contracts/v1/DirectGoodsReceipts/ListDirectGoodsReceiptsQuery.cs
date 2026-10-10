using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;

/// <summary>Direct (non-PO) goods receipts, newest first — mirrors listDirectGoodsReceipts
/// (lib/server/services/inventory-supplier-receipt-service.ts): these never appear in
/// SearchPurchaseOrders since they have no purchase order, so the Purchases surface needs this
/// separate feed to show them at all. Not paginated (same as its Next.js source, capped at 100 rows
/// there); no validator required per api-conventions.md (paginated queries only).
/// <paramref name="BranchId"/> is an optional filter, mirroring other branch-scoped list/report
/// endpoints (docs/branch-scoping-plan.md §2) — omitted, it returns receipts across every branch.</summary>
public sealed record ListDirectGoodsReceiptsQuery(Guid? BranchId = null) : IQuery<IReadOnlyList<DirectGoodsReceiptDto>>;
