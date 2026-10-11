using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

/// <summary>
/// Records a payment received from the customer, reducing the receivable balance.
/// NOTE: does not yet post a corresponding GL voucher — see RecordSupplierPaymentCommand's
/// counterpart note; Accounting ships after Suppliers/Customers (pharmacy-modules-plan.md §6).
/// <para><c>PaymentMethod</c> (optional, default cash) picks the GL money account Accounting debits:
/// cash → Cash, anything else → Bank.</para>
/// </summary>
public sealed record RecordCustomerPaymentCommand(
    Guid CustomerId,
    decimal Amount,
    DateTime PaymentDateUtc,
    string? Description = null,
    string? PaymentMethod = null) : ICommand<Guid>;
