namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// VAT return for a period, from posted vouchers. VAT <b>settlements</b> — payments to IRD
/// (<c>RecordVatPaymentCommand</c>), refunds from IRD and input/output set-off journals — are left out of
/// every figure: they settle VAT, they don't generate it. The printed lines always add up:
/// <c>VatCollected − VatRefundedOrAdjusted = NetVatPayable</c> (net output VAT) and
/// <c>NetVatPayable − InputVat = NetVatDue</c>.
/// </summary>
public sealed record VatReturnReportDto(
    DateTime FromUtc,
    DateTime ToUtc,
    // Output VAT charged on sales (credits to VAT Payable, 2100), excluding settlements.
    decimal VatCollected,
    // Output VAT given back on sales returns/credit notes and other adjustments (debits to 2100),
    // excluding settlements such as the VAT payment itself.
    decimal VatRefundedOrAdjusted,
    // Net output VAT: VatCollected − VatRefundedOrAdjusted.
    decimal NetVatPayable,
    // Input VAT recoverable on purchases (account 1150): debits less credits for the period, excluding
    // settlements (debit-note reversals of input VAT are included and reduce it).
    decimal InputVat = 0m,
    // Output VAT net of input VAT — what is actually owed to IRD for the period.
    decimal NetVatDue = 0m,
    // The branch the figures are for; null = all branches.
    Guid? BranchId = null,
    // VAT settled in the period (paid to IRD net of refunds received / set-offs) — informational only,
    // never part of the figures above.
    decimal VatSettled = 0m,
    // IRD monthly VAT return layout: turnover from the IRD sales / purchase registers (VAT amounts above stay
    // ledger-based), carry-forward from the ledger, and the register-vs-ledger VAT reconciliation.
    VatReturnSalesDto? Sales = null,
    VatReturnPurchasesDto? Purchases = null,
    VatReturnCarryForwardDto? CarryForward = null,
    VatReturnReconciliationDto? Reconciliation = null);
