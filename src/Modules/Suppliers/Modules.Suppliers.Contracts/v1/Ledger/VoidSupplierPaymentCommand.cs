using System.Text.Json.Serialization;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

/// <summary>
/// Voids a wrongly keyed supplier payment. The payment's AP ledger entry stays (the ledger is append-only); a
/// reversing debit referencing it is added, the supplier's balance goes back up, any bill the payment settled
/// is open again, and Accounting reverses the payment's GL voucher off
/// <c>SupplierPaymentVoidedIntegrationEvent</c>, dated at the void. A payment can be voided once; a second void
/// is refused with 409. Returns the id of the reversing ledger entry.
/// <para>A payment whose cheque has cleared in Accounting's cheque register is refused with 409: it is undone by
/// marking the cheque bounced in the register (which also reverses the clearance) or by a reversing entry.</para>
/// </summary>
public sealed record VoidSupplierPaymentCommand(Guid SupplierId, Guid PaymentId, string Reason) : ICommand<Guid>
{
    /// <summary>
    /// Set only by Accounting's cheque register when it bounces a cleared cheque (it reverses the clearance itself).
    /// Never bound from a request body (<see cref="JsonIgnoreAttribute"/>) and forced to false by the HTTP endpoint.
    /// </summary>
    [JsonIgnore]
    public bool BouncedFromChequeRegister { get; init; }
}
