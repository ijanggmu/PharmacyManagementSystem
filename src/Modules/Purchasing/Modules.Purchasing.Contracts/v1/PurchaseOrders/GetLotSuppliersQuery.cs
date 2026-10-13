using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Cross-module query (in-process): which supplier delivered given Inventory lots. A lot is attributed by the
/// non-voided direct goods receipt line that recorded it (<paramref name="BatchIds"/>), and otherwise by the
/// receipt documents (received purchase orders, non-voided direct receipts) whose ids Inventory recorded on the
/// lot's purchase movements (<paramref name="ReceiptIds"/>). Used by Suppliers' expiry claims.
/// </summary>
public sealed record GetLotSuppliersQuery(IReadOnlyList<Guid> BatchIds, IReadOnlyList<Guid> ReceiptIds)
    : IQuery<LotSuppliersDto>;

/// <param name="SupplierByBatchId">Lot id → supplier, from receipt lines that recorded the lot.</param>
/// <param name="SupplierByReceiptId">Receipt document id → supplier.</param>
public sealed record LotSuppliersDto(
    IReadOnlyDictionary<Guid, Guid> SupplierByBatchId,
    IReadOnlyDictionary<Guid, Guid> SupplierByReceiptId);
