using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

/// <summary>
/// Records a payment made to the supplier, reducing the payable balance. Accounting posts the
/// Dr Accounts Payable / Cr Cash|Bank voucher from <c>SupplierPaymentRecordedIntegrationEvent</c>.
/// <para><c>PaymentMethod</c> (optional, default cash) picks the GL money account Accounting credits:
/// cash → Cash, anything else → Bank.</para>
/// <para><c>BillReferenceType</c> / <c>BillReferenceId</c> (optional) pay one bill only — take them from
/// <c>GET /suppliers/{id}/open-bills</c>. The amount may not exceed that bill's outstanding. Without them the
/// payment settles the oldest open bills first.</para>
/// <para>TDS (optional, for service suppliers): <c>TdsAmount</c> &gt; 0 withholds tax at source under
/// <c>TdsCategory</c> (a code from <c>GET /accounting/tds/categories</c>; <c>TdsRatePercent</c> and
/// <c>TdsTaxableAmount</c> — the base excluding VAT, default <c>Amount</c> — are recorded for the TDS report).
/// <c>Amount</c> stays the gross settled: the supplier's ledger is credited <c>Amount</c> (the bill is settled), the
/// money paid out is <c>Amount</c> − <c>TdsAmount</c>, and Accounting credits the TDS to TDS Payable.</para>
/// <para>Cheque (optional, method "cheque"): <c>ChequeNumber</c>, <c>ChequeDateUtc</c> (a post-dated cheque carries a
/// later date) and <c>ChequeBank</c> (the bank it is drawn on) enter the cheque in Accounting's cheque register; the
/// payment is credited to Cheques Issued until the cheque clears. <c>ChequeClearedOnDeposit</c> credits the bank at
/// once instead.</para>
/// </summary>
public sealed record RecordSupplierPaymentCommand(
    Guid SupplierId,
    decimal Amount,
    DateTime PaymentDateUtc,
    string? Description = null,
    string? PaymentMethod = null,
    string? BillReferenceType = null,
    Guid? BillReferenceId = null,
    decimal? TdsAmount = null,
    string? TdsCategory = null,
    decimal? TdsRatePercent = null,
    decimal? TdsTaxableAmount = null,
    string? ChequeNumber = null,
    DateTime? ChequeDateUtc = null,
    string? ChequeBank = null,
    bool ChequeClearedOnDeposit = false) : ICommand<Guid>;
