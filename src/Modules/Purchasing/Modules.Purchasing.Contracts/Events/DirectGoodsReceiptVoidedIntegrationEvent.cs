using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Purchasing.Contracts.Events;

/// <summary>
/// Raised right after a <c>DirectGoodsReceipt</c> is voided — the stock it added has already been
/// reversed synchronously, pre-commit, by <c>IStockDeductionService</c> (same "must never mark voided
/// on a failed reversal" reasoning as receiving). Consumed by <c>Suppliers</c> (credits back the AP
/// ledger via <c>ISupplierLedgerService.RecordReturnAsync</c>) and <c>Accounting</c> (voids the GL
/// voucher posted for the original receipt, same pattern as <c>SaleCancelledIntegrationEventHandler</c>
/// using <c>IVoucherPostingService.FindPostedVoucherIdAsync</c> + <c>VoidAsync</c>).
/// </summary>
public sealed record DirectGoodsReceiptVoidedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid ReceiptId,
    Guid SupplierId,
    decimal GrossAmount,
    DateTime ReceiptDateUtc,
    string Reason,
    // Our serial (GRN-…), for the AP ledger description. Optional for queued events.
    string? ReceiptNumber = null,
    // Branch the receipt belonged to, so the AP reversal lands on the same branch.
    Guid? BranchId = null,
    // When the void happened. Reversals (AP credit, GL voucher, IRD purchase-register negative row) are
    // dated here, not at the original receipt date, so a closed period is never rewritten. Null on events
    // queued before this field existed — consumers fall back to OccurredOnUtc.
    DateTime? VoidedAtUtc = null)
    : IIntegrationEvent;
