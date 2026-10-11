using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>One received purchase line (from a purchase order or a direct goods receipt), for Suppliers'
/// cost-history read model.</summary>
public sealed record PurchaseLineHistoryDto(
    Guid MedicineId,
    DateTime ReceiptDateUtc,
    decimal UnitCostPrice,
    decimal Quantity);

/// <summary>
/// Cross-module query: every received purchase line for a supplier — received purchase orders and
/// non-voided direct goods receipts — newest first; the raw feed for Suppliers' cost-history report
/// (mirrors <c>getSupplierCostHistory</c> in supplier-cost-history-service.ts, including its union of the
/// direct/bulk-import receipt path). Suppliers resolves each <see cref="PurchaseLineHistoryDto.MedicineId"/>
/// to a name via Inventory separately.
/// </summary>
public sealed record GetSupplierPurchaseHistoryQuery(Guid SupplierId, int Limit = 200)
    : IQuery<IReadOnlyList<PurchaseLineHistoryDto>>;
