using System.Text.Json.Serialization;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

/// <summary>
/// Voids a wrongly keyed customer payment. The payment's AR ledger entry stays (the ledger is append-only); a
/// reversing debit referencing it is added, the customer's balance goes back up, and Accounting reverses the
/// payment's GL voucher off <c>CustomerPaymentVoidedIntegrationEvent</c>, dated at the void. A payment can be
/// voided once; a second void is refused with 409. Returns the id of the reversing ledger entry.
/// <para>A payment whose cheque has cleared in Accounting's cheque register is refused with 409: it is undone by
/// marking the cheque bounced in the register (which also reverses the clearance) or by a reversing entry.</para>
/// </summary>
public sealed record VoidCustomerPaymentCommand(Guid CustomerId, Guid PaymentId, string Reason) : ICommand<Guid>
{
    /// <summary>
    /// Set only by Accounting's cheque register when it bounces a cleared cheque (it reverses the clearance itself).
    /// Never bound from a request body (<see cref="JsonIgnoreAttribute"/>) and forced to false by the HTTP endpoint.
    /// </summary>
    [JsonIgnore]
    public bool BouncedFromChequeRegister { get; init; }
}
