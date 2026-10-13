using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Accounting.Contracts.Events;

/// <summary>
/// Raised when a pay-later expense is recorded: Accounting has posted Dr Expense (+ Input VAT) / Cr Accounts
/// Payable for <see cref="Amount"/> (the gross bill less any TDS withheld — what is actually owed; the TDS is
/// credited to TDS Payable), in the same transaction as this event. Consumed by
/// <c>Suppliers</c>, which adds the bill (a debit) to the supplier's AP ledger so the AP control account and the
/// supplier balances stay reconciled; the bill is then settled through the normal supplier payment flow.
/// Idempotent by <see cref="ExpenseId"/> (reference type <c>Expense</c>).
/// </summary>
public sealed record ExpenseBillRecordedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid ExpenseId,
    Guid SupplierId,
    decimal Amount,
    DateTime ExpenseDateUtc,
    string Category,
    // The supplier's bill / invoice number, when given.
    string? BillNumber = null,
    string? Description = null,
    // Branch the expense was recorded at, so the AP entry lands on the same branch as the GL voucher.
    Guid? BranchId = null,
    // TDS withheld from the bill (already deducted from Amount). Informational; 0 on events queued before TDS.
    decimal TdsAmount = 0m,
    // The bill's due date when it was set on the expense; null = Suppliers works it out from the supplier's credit days.
    DateTime? DueDateUtc = null)
    : IIntegrationEvent;
