using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Customers.Contracts.Events;

/// <summary>
/// Raised when a customer is created with a non-zero opening balance, in the same transaction as the
/// customer and its <c>OpeningBalance</c> AR ledger entry. Consumed by <c>Accounting</c>, which posts the
/// matching GL voucher so the Accounts Receivable control account agrees with the customer subledger:
/// a positive <see cref="Amount"/> (the customer owes the pharmacy) is Dr Accounts Receivable /
/// Cr Owner's Equity; a negative one (the pharmacy owes the customer — an advance) is the reverse.
/// <para>Not raised by the onboarding migration wizard: that posts its customer opening balances to the GL
/// only, without creating customers, so the two never post the same balance twice.</para>
/// </summary>
public sealed record CustomerOpeningBalanceRecordedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid LedgerEntryId,
    Guid CustomerId,
    string CustomerName,
    // Signed: positive = receivable (customer owes), negative = customer credit / advance.
    decimal Amount,
    // Branch the customer was created at; null = Accounting falls back to the tenant's default branch.
    Guid? BranchId = null)
    : IIntegrationEvent;
