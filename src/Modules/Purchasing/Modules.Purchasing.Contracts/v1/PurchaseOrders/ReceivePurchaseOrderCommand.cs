using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Receives an approved purchase order onto Inventory, then (via the outbox) posts the AP voucher on
/// Accounting and the AP ledger movement on Suppliers.
/// <para>
/// An order is received once. A short delivery is supported: set <see cref="PurchaseOrderLineReceiptInput.QuantityReceived"/>
/// below the ordered quantity (0 for a line that did not arrive). The order is then cut down to what
/// arrived and closed as Received, and — when <see cref="CreateBackorder"/> is true — the undelivered
/// balance is placed on a new draft purchase order to the same supplier. Receiving the same order again
/// in several deliveries is not supported: stock, the AP ledger entry and the GL voucher are each posted
/// once per order (the voucher is unique per order id).
/// </para>
/// <see cref="Lines"/> also carries the batch number, expiry and selling price for lines that were
/// ordered without them. Every received line must end up with all three, or the receipt is rejected.
/// </summary>
public sealed record ReceivePurchaseOrderCommand(
    Guid PurchaseOrderId,
    IReadOnlyList<PurchaseOrderLineReceiptInput>? Lines = null,
    DateTime? ReceiptDateUtc = null,
    bool CreateBackorder = true,
    // When the supplier's bill falls due; null = the receipt date plus the supplier's credit days.
    DateTime? DueDateUtc = null,
    // The supplier's bill number when it arrives with the goods; null/blank keeps the one entered on the order.
    string? SupplierInvoiceNumber = null) : ICommand<ReceivePurchaseOrderResult>;

/// <summary>Body of POST /purchase-orders/{purchaseOrderId}/receive. The body is optional.</summary>
public sealed record ReceivePurchaseOrderRequest(
    IReadOnlyList<PurchaseOrderLineReceiptInput>? Lines = null,
    DateTime? ReceiptDateUtc = null,
    bool? CreateBackorder = null,
    DateTime? DueDateUtc = null,
    string? SupplierInvoiceNumber = null);

/// <summary>
/// <see cref="BackorderPurchaseOrderId"/> is the new draft order holding the undelivered balance, when the
/// delivery was short and a backorder was requested.
/// </summary>
public sealed record ReceivePurchaseOrderResult(
    Guid PurchaseOrderId,
    Guid? BackorderPurchaseOrderId,
    int ShortLineCount);
