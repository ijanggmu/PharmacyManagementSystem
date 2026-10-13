using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

/// <summary>
/// Records a payment received from the customer, reducing the receivable balance.
/// NOTE: does not yet post a corresponding GL voucher — see RecordSupplierPaymentCommand's
/// counterpart note; Accounting ships after Suppliers/Customers (pharmacy-modules-plan.md §6).
/// <para><c>PaymentMethod</c> (optional, default cash) picks the GL money account Accounting debits:
/// cash → Cash, anything else → Bank.</para>
/// <para>Cheque (optional, method "cheque"): <c>ChequeNumber</c>, <c>ChequeDateUtc</c> (the date written on it — a
/// post-dated cheque carries a later date) and <c>ChequeBank</c> (the drawer's bank) enter the cheque in Accounting's
/// cheque register; the receipt then sits in Cheques in Hand until the cheque clears. <c>ChequeClearedOnDeposit</c>
/// posts it straight to the bank instead (a same-day cheque the user treats as money in the bank).</para>
/// </summary>
public sealed record RecordCustomerPaymentCommand(
    Guid CustomerId,
    decimal Amount,
    DateTime PaymentDateUtc,
    string? Description = null,
    string? PaymentMethod = null,
    string? ChequeNumber = null,
    DateTime? ChequeDateUtc = null,
    string? ChequeBank = null,
    bool ChequeClearedOnDeposit = false) : ICommand<Guid>;
