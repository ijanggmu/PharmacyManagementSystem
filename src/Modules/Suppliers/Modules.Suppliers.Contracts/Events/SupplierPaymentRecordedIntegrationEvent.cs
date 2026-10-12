using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Suppliers.Contracts.Events;

/// <summary>
/// Raised right after a supplier payment's AP ledger entry is committed. Consumed by
/// <c>Accounting</c> (posts the debit-AP/credit-Cash voucher). Replaces the previous in-process call
/// to <c>IVoucherPostingService</c> made from <c>RecordSupplierPaymentCommandHandler</c> after its own
/// <c>SaveChangesAsync</c> — see docs/pharmacy-modules-plan.md §2.
/// </summary>
public sealed record SupplierPaymentRecordedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid LedgerEntryId,
    Guid SupplierId,
    string SupplierName,
    decimal Amount,
    string? Description,
    // Branch the money moved at. Optional so events already queued in the outbox still deserialize
    // (Accounting then falls back to the tenant's default branch).
    Guid? BranchId = null,
    // How the money moved ("cash", "bank", "cheque", "card", "esewa", …). Optional so events already
    // queued in the outbox still deserialize; Accounting treats null as cash.
    string? PaymentMethod = null,
    // The payment's business date (the ledger entry date the user picked). Optional so events already
    // queued in the outbox still deserialize; Accounting then falls back to OccurredOnUtc.
    DateTime? PaymentDateUtc = null)
    : IIntegrationEvent;
