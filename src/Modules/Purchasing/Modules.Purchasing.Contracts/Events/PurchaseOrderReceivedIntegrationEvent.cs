using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Purchasing.Contracts.Events;

/// <summary>
/// Raised right after a <c>PurchaseOrder</c> is marked received (stock already added via
/// <c>IStockReceiptService</c>, pre-commit, synchronously). Consumed by <c>Suppliers</c> (posts the AP
/// ledger entry) and <c>Accounting</c> (posts the AP voucher). Replaces the previous in-process calls
/// to <c>ISupplierLedgerService</c>/<c>IVoucherPostingService</c> made from
/// <c>ReceivePurchaseOrderCommandHandler</c> after its own <c>SaveChangesAsync</c> — see
/// docs/pharmacy-modules-plan.md §2.
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
    string? SupplierInvoiceNumber = null)
    : IIntegrationEvent;
