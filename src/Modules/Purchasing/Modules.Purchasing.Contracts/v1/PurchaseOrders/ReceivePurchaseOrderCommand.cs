using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// Receives an approved purchase order: books the delivery as a goods receipt (GRN, numbered like any other
/// receipt and linked to the order), puts the stock in, and (via the outbox) posts the AP ledger entry on
/// Suppliers and the purchase voucher on Accounting for that receipt.
/// <para>
/// An order is received once. A short delivery is supported: set <see cref="PurchaseOrderLineReceiptInput.QuantityReceived"/>
/// below the ordered quantity (0 for a line that did not arrive). The order is then cut down to what
/// arrived and closed as Received, and — when <see cref="CreateBackorder"/> is true — the undelivered
/// balance is placed on a new draft purchase order to the same supplier. A receipt entered wrongly is voided
/// like any goods receipt; that reverses the stock, AP and voucher and puts the order back to Approved.
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
/// delivery was short and a backorder was requested. <see cref="GoodsReceiptId"/>/<see cref="ReceiptNumber"/> name
/// the goods receipt (GRN) the delivery was booked on.
/// </summary>
public sealed record ReceivePurchaseOrderResult(
    Guid PurchaseOrderId,
    Guid? BackorderPurchaseOrderId,
    int ShortLineCount,
    Guid? GoodsReceiptId = null,
    string? ReceiptNumber = null);
