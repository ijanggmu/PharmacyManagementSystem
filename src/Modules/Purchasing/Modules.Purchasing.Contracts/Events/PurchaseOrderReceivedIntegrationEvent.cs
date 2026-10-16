using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Purchasing.Contracts.Events;

/// <summary>
/// Raised right after a <c>PurchaseOrder</c> is marked received (stock already added via
/// <c>IStockReceiptService</c>, pre-commit, synchronously). Consumed by <c>Suppliers</c> (posts the AP
/// ledger entry) and <c>Accounting</c> (posts the AP voucher). Replaces the previous in-process calls
/// to <c>ISupplierLedgerService</c>/<c>IVoucherPostingService</c> made from
/// <c>ReceivePurchaseOrderCommandHandler</c> after its own <c>SaveChangesAsync</c> — see
/// docs/pharmacy-modules-plan.md §2.
/// <para><c>TotalAmount</c> is the received order's taxable NET — after line trade discounts and the bill
/// discount (free goods add nothing) — and <c>VatAmount</c> the input VAT on it; the payable is their sum.</para>
/// </summary>
public sealed record PurchaseOrderReceivedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid PurchaseOrderId,
    Guid SupplierId,
    decimal TotalAmount,
    DateTime OrderDateUtc,
    decimal VatAmount = 0m,
    // Branch the money moved at. Optional so events already queued in the outbox still deserialize
    // (Accounting then falls back to the tenant's default branch).
    Guid? BranchId = null,
    // The supplier's bill number captured on the order, for the AP ledger. Optional for queued events.
    string? SupplierInvoiceNumber = null,
    // When the goods were actually received (the receipt date captured at receive). The AP ledger entry and
    // the purchase voucher are dated by this, not by the order date. Null on events queued before it
    // existed — consumers then fall back to OrderDateUtc.
    DateTime? ReceivedAtUtc = null,
    // The bill's due date when it was set at receive; null = Suppliers works it out from the supplier's credit days.
    DateTime? DueDateUtc = null,
    // The order's number (PO-MAIN-2083/84-00003), shown on the AP ledger and the bill picker. Null for orders
    // raised before numbering and for events queued before it existed.
    string? OrderNumber = null)
    : IIntegrationEvent;
