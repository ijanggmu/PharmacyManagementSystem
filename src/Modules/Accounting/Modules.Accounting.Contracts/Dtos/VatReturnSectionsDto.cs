namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// Sales section of the IRD monthly VAT return. Turnover comes from the IRD sales register (Sales module):
/// invoices issued in the period less cancellations and credit notes (returns, refunds) recorded in it. All
/// <c>Returns*</c> values are positive amounts to subtract; the <c>Net*</c> values are after them. Taxable
/// values exclude VAT. There is no export / zero-rated sale type in the system, so <see cref="ExportSales"/> is 0.
/// <para>Fixed assets sold with VAT (a VAT-registered seller's output VAT on the sale) are taxable supplies too: they
/// are included in <see cref="TaxableSales"/>, <see cref="OutputVat"/>, the <c>Net*</c> values and
/// <see cref="InvoiceCount"/>, and shown on their own in <see cref="FixedAssetSales"/> / <see cref="FixedAssetSalesVat"/>
/// ("of which") so the return can list them as a separate line.</para>
/// </summary>
public sealed record VatReturnSalesDto(
    decimal TaxableSales,
    decimal OutputVat,
    decimal ExemptSales,
    decimal ExportSales,
    // Documents with no VAT breakdown at all (recorded before VAT was tracked) — review before filing.
    decimal UnclassifiedSales,
    decimal ReturnsTaxable,
    decimal ReturnsExempt,
    decimal ReturnsVat,
    decimal NetTaxableSales,
    decimal NetExemptSales,
    decimal NetOutputVat,
    // Net taxable + net exempt + export + unclassified (VAT-exclusive turnover).
    decimal NetTotalSales,
    int InvoiceCount,
    int CreditNoteCount,
    // Of which: fixed assets sold with VAT in the period (VAT-exclusive proceeds, output VAT, number of sales).
    decimal FixedAssetSales = 0m,
    decimal FixedAssetSalesVat = 0m,
    int FixedAssetSaleCount = 0);

/// <summary>
/// Purchases section of the IRD monthly VAT return. Turnover comes from the IRD purchase register (Purchasing,
/// with supplier debit notes from Suppliers): bills received in the period less debit notes and voided
/// receipts recorded in it (<c>DebitNotes*</c>, positive amounts to subtract). There is no import purchase type
/// in the system, so the import figures are 0.
/// </summary>
public sealed record VatReturnPurchasesDto(
    decimal TaxablePurchases,
    decimal InputVat,
    decimal ExemptPurchases,
    decimal ImportPurchases,
    decimal ImportVat,
    decimal DebitNotesTaxable,
    decimal DebitNotesExempt,
    decimal DebitNotesVat,
    decimal NetTaxablePurchases,
    decimal NetExemptPurchases,
    decimal NetInputVat,
    decimal NetTotalPurchases,
    int BillCount,
    int DebitNoteCount);

/// <summary>
/// Credit brought forward / carried forward and the VAT position with IRD, all from the ledger. The VAT
/// position at an instant is <c>(VAT Payable 2100 credits − debits) − (Input VAT 1150 debits − credits)</c> over
/// every ledger voucher before it — VAT activity and settlements (payments to IRD, refunds from IRD) alike —,
/// so positive = VAT still owed, negative = excess input VAT credit.
/// <list type="bullet">
/// <item><see cref="OpeningPosition"/>: position as of the period start. Negative → <see cref="CreditBroughtForward"/>;
/// positive → <see cref="UnpaidVatBroughtForward"/> (earlier returns not fully paid; arrears, not part of this return).</item>
/// <item><see cref="NetVatForPeriod"/>: this period's output VAT − input VAT (the return's own figure).</item>
/// <item><see cref="VatPayable"/> = max(0, NetVatForPeriod − CreditBroughtForward): due for this return.</item>
/// <item><see cref="CreditCarriedForward"/> = max(0, CreditBroughtForward − NetVatForPeriod): to next period.</item>
/// <item><see cref="VatPaidInPeriod"/>: payments to IRD dated in the period, net of refunds received (set-off
/// journals move VAT between 2100 and 1150 and count as 0).</item>
/// <item><see cref="ClosingPosition"/> = Opening + NetVatForPeriod − VatPaidInPeriod: the position as of the period
/// end (positive = balance still due to IRD, negative = credit).</item>
/// </list>
/// </summary>
public sealed record VatReturnCarryForwardDto(
    decimal OpeningPosition,
    decimal CreditBroughtForward,
    decimal UnpaidVatBroughtForward,
    decimal NetVatForPeriod,
    decimal VatPayable,
    decimal CreditCarriedForward,
    decimal VatPaidInPeriod,
    decimal ClosingPosition);

/// <summary>
/// Register VAT vs ledger VAT for the period. Output: the sales register's net output VAT vs the ledger's net
/// output VAT (2100 activity) — the register side includes output VAT on fixed asset sales, which the disposal
/// voucher credits to 2100. Input: the purchase register's net input VAT vs the ledger's input VAT (1150
/// activity). A difference means a document was posted to one side only (a manual journal on a VAT account, a
/// sale/purchase not yet posted, input VAT on expenses, or a back-dated document) and should be explained before
/// filing. <see cref="HasDifference"/> is true when either differs by 0.01 or more.
/// </summary>
public sealed record VatReturnReconciliationDto(
    decimal RegisterOutputVat,
    decimal LedgerOutputVat,
    decimal OutputVatDifference,
    decimal RegisterInputVat,
    decimal LedgerInputVat,
    decimal InputVatDifference,
    bool HasDifference);
