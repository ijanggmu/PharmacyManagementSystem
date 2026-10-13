using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Customers.Contracts.Events;

/// <summary>
/// Raised right after a customer payment is voided (its reversing AR ledger entry committed). Consumed by
/// <c>Accounting</c>, which reverses the voucher posted for <see cref="CustomerPaymentRecordedIntegrationEvent"/>
/// (reference <c>CustomerPayment</c> / <see cref="LedgerEntryId"/>) through the system reversal path, dated at
/// <see cref="VoidedAtUtc"/> (moved to the first open day when that falls in a locked period).
/// </summary>
public sealed record CustomerPaymentVoidedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    // The voided payment's ledger entry id: the reference its GL voucher was posted under.
    Guid LedgerEntryId,
    // The reversing ledger entry the void added.
    Guid VoidEntryId,
    Guid CustomerId,
    string CustomerName,
    decimal Amount,
    string Reason,
    DateTime VoidedAtUtc,
    // The payment's receipt number (RCP-…), when it had one.
    string? ReceiptNumber = null,
    Guid? BranchId = null)
    : IIntegrationEvent;
