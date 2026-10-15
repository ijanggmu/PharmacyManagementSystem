using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Cheques;

/// <summary>
/// Whether the register already holds a live cheque with this number from (or to) the same party — for the Customers /
/// Suppliers payment paths to refuse (409) recording the same cheque twice before the payment is saved. A cheque that
/// bounced or was cancelled doesn't count, so a returned cheque can be presented again under a new payment.
/// <c>PaymentReferenceType</c> is one of <see cref="ChequePaymentReferenceTypes"/> (it fixes the direction: received
/// from a customer, issued to a supplier). Not exposed over HTTP and not branch-scoped.
/// </summary>
public sealed record IsChequeNumberInUseQuery(string PaymentReferenceType, Guid PartyId, string ChequeNumber) : IQuery<bool>;
