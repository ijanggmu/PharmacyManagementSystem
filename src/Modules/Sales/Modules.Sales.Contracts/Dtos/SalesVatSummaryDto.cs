namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>
/// Sales side of the IRD monthly VAT return, from the IRD sales register (<c>GetSalesVatSummaryQuery</c>).
/// Gross figures cover invoices issued in the period; the <c>Returns*</c> figures are the reversals recorded in
/// the period (cancellations, sales returns and refunds — credit notes), as POSITIVE amounts to subtract.
/// Taxable values are VAT-exclusive. The system has no export (zero-rated) sale type, so
/// <see cref="ExportSales"/> is always 0 for now; it is part of the contract so the return keeps IRD's layout.
/// </summary>
public sealed record SalesVatSummaryDto(
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    // Invoices issued in the period (later cancellations included — they reverse in their own period).
    int InvoiceCount,
    decimal TaxableSales,
    decimal ExemptSales,
    decimal OutputVat,
    decimal ExportSales,
    // Net value of documents recorded before VAT was tracked per document (no VAT figure at all), which can't
    // be classed as taxable or exempt: such invoices less such reversals. Normally 0; anything else should be
    // reviewed before filing.
    decimal UnclassifiedSales,
    // Cancellations + credit notes (returns, refunds) recorded in the period.
    int CreditNoteCount,
    decimal ReturnsTaxable,
    decimal ReturnsExempt,
    decimal ReturnsVat);
