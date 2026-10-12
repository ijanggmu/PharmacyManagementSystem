using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Suppliers.Contracts.Events;

/// <summary>
/// Raised when a supplier is created with a non-zero opening balance, right after its <c>OpeningBalance</c> AP
/// ledger entry is committed (same transaction, via the outbox). Consumed by <c>Accounting</c>, which posts the
/// matching GL voucher so the AP control account agrees with the supplier subledger: a positive
/// <see cref="Amount"/> (the pharmacy owes the supplier) is Cr Accounts Payable / Dr Owners' Equity (opening
/// balance equity); a negative one (an advance / supplier owes us) is the reverse.
///
/// Not raised by the Onboarding migration wizard, which posts the subledger through
/// <c>ISupplierLedgerService</c> and its own GL voucher — so the two paths never double-post.
/// </summary>
public sealed record SupplierOpeningBalanceRecordedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    // The AP ledger entry: the idempotency key for the voucher.
    Guid LedgerEntryId,
    Guid SupplierId,
    string SupplierName,
    // Signed: positive = payable to the supplier, negative = receivable / advance.
    decimal Amount,
    DateTime VoucherDateUtc,
    Guid? BranchId = null)
    : IIntegrationEvent;
