using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Inventory.Contracts.Events;

/// <summary>
/// Raised (Outbox, same transaction as the stock write) when a medicine create or stock increase
/// carries a supplier and a positive net value — the .NET port of the supplier-payable half of
/// postDirectInventorySupplierReceipts (inventory-supplier-receipt-service.ts). Consumed by
/// <c>Suppliers</c> (AP ledger entry via <c>ISupplierLedgerService.RecordPurchaseAsync</c>) and
/// <c>Accounting</c> (Dr Inventory (net) / Dr Input VAT Recoverable (1150, when <see cref="VatAmount"/>
/// is greater than zero) / Cr Accounts Payable voucher), the same two-consumer pattern as
/// <see cref="ConsignmentSettledIntegrationEvent"/>. <see cref="GrossAmount"/> is net cost plus VAT.
/// </summary>
public sealed record MedicineStockReceivedFromSupplierIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid ReceiptId,
    Guid MedicineId,
    Guid SupplierId,
    decimal GrossAmount,
    DateTime ReceiptDateUtc,
    string? SupplierInvoiceNumber,
    decimal VatAmount = 0m,
    // Branch the money moved at. Optional so events already queued in the outbox still deserialize
    // (Accounting then falls back to the tenant's default branch).
    Guid? BranchId = null,
    // Per-medicine lines of the bill. When present (with a BranchId), Purchasing records the stock
    // as a DirectGoodsReceipt and posts the payable/voucher through DirectGoodsReceiptPostedIntegrationEvent,
    // so Suppliers and Accounting skip this event. Null on events queued before the lines existed,
    // which still post directly from this event.
    IReadOnlyList<SupplierStockReceiptLine>? Lines = null,
    string? ReceivedBy = null,
    // Set when the bill was paid at entry; null = bought on credit.
    SupplierBillPayment? Payment = null)
    : IIntegrationEvent;

/// <summary>One medicine on a supplier bill received through a medicine create/update or bulk import.
/// <see cref="VatAmount"/> is this line's VAT, not a per-unit amount.</summary>
public sealed record SupplierStockReceiptLine(
    Guid MedicineId,
    decimal Quantity,
    decimal UnitCost,
    decimal VatAmount);
