using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Suppliers.Contracts.Events;

/// <summary>
/// Raised right after a supplier payment is voided (its reversing AP ledger entry committed). Consumed by
/// <c>Accounting</c>, which reverses the voucher posted for <see cref="SupplierPaymentRecordedIntegrationEvent"/>
/// (reference <c>SupplierPayment</c> / <see cref="LedgerEntryId"/>) through the system reversal path, dated at
/// <see cref="VoidedAtUtc"/> (moved to the first open day when that falls in a locked period).
/// </summary>
public sealed record SupplierPaymentVoidedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    // The voided payment's ledger entry id: the reference its GL voucher was posted under.
    Guid LedgerEntryId,
    // The reversing ledger entry the void added.
    Guid VoidEntryId,
    Guid SupplierId,
    string SupplierName,
    decimal Amount,
    string Reason,
    DateTime VoidedAtUtc,
    Guid? BranchId = null)
    : IIntegrationEvent;
