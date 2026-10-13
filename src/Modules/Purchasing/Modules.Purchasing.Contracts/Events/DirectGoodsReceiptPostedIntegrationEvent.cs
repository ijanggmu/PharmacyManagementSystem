using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Purchasing.Contracts.Events;

/// <summary>
/// Raised right after a <c>DirectGoodsReceipt</c> is posted (stock already added via
/// <c>IStockReceiptService</c>, pre-commit, synchronously — same shape as
/// <see cref="PurchaseOrderReceivedIntegrationEvent"/>). Consumed by <c>Suppliers</c> (posts the AP
/// ledger entry, for <paramref name="GrossAmount"/>) and <c>Accounting</c> (posts the GL voucher:
/// Dr Inventory for the net amount, Dr Input VAT Recoverable (account 1150) for
/// <paramref name="VatAmount"/> when it is greater than zero, Cr Accounts Payable for
/// <paramref name="GrossAmount"/> — same split as <see cref="PurchaseOrderReceivedIntegrationEvent"/>,
/// no longer capitalizing VAT into inventory cost). The net is after line trade discounts and the bill
/// discount, so the gross is the supplier's discounted bill.
/// </summary>
public sealed record DirectGoodsReceiptPostedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid ReceiptId,
    Guid SupplierId,
    decimal GrossAmount,
    DateTime ReceiptDateUtc,
    decimal VatAmount = 0m,
    // Branch the money moved at. Optional so events already queued in the outbox still deserialize
    // (Accounting then falls back to the tenant's default branch).
    Guid? BranchId = null,
    // Our serial (GRN-…) and the supplier's bill number, for the AP ledger. Optional for queued events.
    string? ReceiptNumber = null,
    string? SupplierInvoiceNumber = null,
    // Set when the bill was paid at entry: Suppliers records the payment against this receipt.
    DirectGoodsReceiptPayment? Payment = null,
    // The bill's due date when it was set on the receipt; null = Suppliers works it out from the supplier's credit days.
    DateTime? DueDateUtc = null)
    : IIntegrationEvent;

/// <summary>A payment made when the receipt was entered ("paid at entry"). <see cref="Amount"/> is the amount
/// paid (already resolved — never more than the receipt's gross); <see cref="PaymentDateUtc"/> the date paid.</summary>
public sealed record DirectGoodsReceiptPayment(
    string Method,
    decimal Amount,
    DateTime PaymentDateUtc,
    string? Reference = null);
