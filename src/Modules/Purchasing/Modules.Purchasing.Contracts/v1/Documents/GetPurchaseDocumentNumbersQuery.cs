using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.Documents;

/// <summary>Our number and the supplier's bill number for a purchase document. <see cref="DocumentNumber"/> is
/// the GRN number of a direct goods receipt (purchase orders have none yet).</summary>
public sealed record PurchaseDocumentNumberDto(Guid Id, string? DocumentNumber, string? SupplierBillNumber);

/// <summary>Looks up numbers for direct goods receipts and purchase orders by id — used by Suppliers to fill
/// document numbers on AP ledger entries recorded before they were carried on the events. In-process only
/// (no endpoint).</summary>
public sealed record GetPurchaseDocumentNumbersQuery(
    IReadOnlyCollection<Guid> DirectGoodsReceiptIds,
    IReadOnlyCollection<Guid> PurchaseOrderIds) : IQuery<IReadOnlyList<PurchaseDocumentNumberDto>>;
