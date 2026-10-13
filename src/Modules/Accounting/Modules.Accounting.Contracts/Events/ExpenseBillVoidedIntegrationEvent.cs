using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Accounting.Contracts.Events;

/// <summary>
/// Raised when a pay-later expense is deleted: Accounting has reversed its voucher (the AP credit included) in
/// the same transaction as this event. Consumed by <c>Suppliers</c>, which credits the bill back on the supplier's
/// AP ledger (reference type <c>ExpenseVoid</c>, idempotent by <see cref="ExpenseId"/>). Accounting refuses the
/// delete while any payment or credit is allocated to the bill, so the credit normally just closes it.
/// </summary>
public sealed record ExpenseBillVoidedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid ExpenseId,
    Guid SupplierId,
    decimal Amount,
    // When the expense was deleted; the AP credit is dated here, like the GL reversal.
    DateTime VoidedAtUtc,
    string Reason,
    string? BillNumber = null,
    Guid? BranchId = null)
    : IIntegrationEvent;
