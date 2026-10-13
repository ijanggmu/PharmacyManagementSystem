using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

/// <summary>
/// Voids a wrongly keyed customer payment. The payment's AR ledger entry stays (the ledger is append-only); a
/// reversing debit referencing it is added, the customer's balance goes back up, and Accounting reverses the
/// payment's GL voucher off <c>CustomerPaymentVoidedIntegrationEvent</c>, dated at the void. A payment can be
/// voided once; a second void is refused with 409. Returns the id of the reversing ledger entry.
/// </summary>
public sealed record VoidCustomerPaymentCommand(Guid CustomerId, Guid PaymentId, string Reason) : ICommand<Guid>;
