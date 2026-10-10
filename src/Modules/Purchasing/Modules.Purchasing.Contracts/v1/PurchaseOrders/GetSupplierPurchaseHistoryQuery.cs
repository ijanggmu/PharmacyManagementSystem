using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>One received purchase-order line, for Suppliers' cost-history read model.</summary>
public sealed record PurchaseLineHistoryDto(
    Guid MedicineId,
    DateTime ReceiptDateUtc,
    decimal UnitCostPrice,
    decimal Quantity);

/// <summary>
/// Cross-module query: every received purchase-order line for a supplier, newest first — the raw
/// feed for Suppliers' cost-history report (mirrors <c>getSupplierCostHistory</c> in
/// supplier-cost-history-service.ts, minus the direct/bulk-import receipt union that source also
/// does — no non-PO receiving flow exists yet in this port). Suppliers resolves each
/// <see cref="PurchaseLineHistoryDto.MedicineId"/> to a name via Inventory separately.
/// </summary>
public sealed record GetSupplierPurchaseHistoryQuery(Guid SupplierId, int Limit = 200)
    : IQuery<IReadOnlyList<PurchaseLineHistoryDto>>;
