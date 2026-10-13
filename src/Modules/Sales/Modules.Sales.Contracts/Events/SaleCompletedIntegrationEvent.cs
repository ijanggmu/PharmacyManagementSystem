using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>One sold line, enough for a consumer to update its own bookkeeping without a callback
/// into Sales.</summary>
public sealed record SaleCompletedLine(Guid MedicineId, decimal Quantity);

/// <summary>One tender leg of a completed sale (cash, card, credit, ...). <c>Method</c> is the canonical
/// lowercase method name stored on the sale's payment row.</summary>
public sealed record SaleCompletedPayment(string Method, decimal Amount);

/// <summary>
/// Raised right after a <c>Sale</c> and its items are committed. Consumed by <c>Accounting</c>
/// (posts the GL voucher — payment/revenue/COGS/inventory) and, when <see cref="PrescriptionId"/> is
/// set, by <c>Prescriptions</c> (records the dispensed quantity/refill). Replaces the previous
/// in-process, non-atomic calls to <c>IVoucherPostingService</c>/<c>IDispensingSafetyPolicy</c> made
/// from <c>CreateSaleCommandHandler</c> after its own <c>SaveChangesAsync</c> — see
/// docs/pharmacy-modules-plan.md §2 for why this moved to the Outbox/Inbox saga pattern instead of a
/// shared-transaction retrofit.
/// <see cref="Payments"/> carries every tender leg (including credit legs) so consumers can post per tender.
/// It is null for events published before per-tender data existed; consumers then fall back to
/// <see cref="PaymentMethod"/> / <see cref="PaymentAmount"/>.
/// </summary>
public sealed record SaleCompletedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid SaleId,
    Guid BranchId,
    Guid? CustomerId,
    Guid? PrescriptionId,
    string PaymentMethod,
    decimal PaymentAmount,
    decimal TotalAmount,
    decimal BalanceDue,
    decimal VatAmount,
    decimal TotalCost,
    IReadOnlyList<SaleCompletedLine> Lines,
    IReadOnlyList<SaleCompletedPayment>? Payments = null,
    // IRD invoice number (INV-…). Optional so events already queued in the outbox still deserialize.
    string? InvoiceNumber = null,
    // Loyalty points the customer spent on this sale (their value is part of the line discounts).
    int LoyaltyPointsRedeemed = 0,
    // The cashier asked for an SMS receipt (to SmsReceiptPhone, or the customer's phone when null).
    bool SmsReceipt = false,
    string? SmsReceiptPhone = null)
    : IIntegrationEvent;
