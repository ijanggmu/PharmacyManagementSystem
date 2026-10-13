using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

/// <summary>
/// Voids a wrongly keyed supplier payment. The payment's AP ledger entry stays (the ledger is append-only); a
/// reversing debit referencing it is added, the supplier's balance goes back up, any bill the payment settled
/// is open again, and Accounting reverses the payment's GL voucher off
/// <c>SupplierPaymentVoidedIntegrationEvent</c>, dated at the void. A payment can be voided once; a second void
/// is refused with 409. Returns the id of the reversing ledger entry.
/// </summary>
public sealed record VoidSupplierPaymentCommand(Guid SupplierId, Guid PaymentId, string Reason) : ICommand<Guid>;
