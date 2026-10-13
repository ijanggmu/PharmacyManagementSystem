namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>Response of <c>SendIrdInvoiceCommand</c> — .NET port of the Next.js reference's POST
/// <c>/api/ird</c> success body (<c>{ saleId, invoiceNumber }</c>).</summary>
public sealed record SendIrdInvoiceResponseDto(Guid SaleId, Guid QueueItemId, string InvoiceNumber);

/// <summary>One recent failed IRD queue row, as surfaced by the Next.js reference's
/// <c>getSystemHealthForTenant</c> (system-diagnostics-service.ts).</summary>
public sealed record IrdFailedQueueItemDto(Guid Id, string? LastError, DateTime CreatedAtUtc);

/// <summary>
/// .NET port of the Next.js reference's <c>getSystemHealthForTenant</c> IRD section
/// (system-diagnostics-service.ts, served by the Next.js app's <c>/api/system-health</c> route — which,
/// despite the generic name, reports only IRD queue health, not infra liveness; see
/// <c>GetIrdQueueHealthQuery</c> remarks). Deliberate deviation from upstream: <see cref="PendingCount"/>
/// and <see cref="FailedCount"/> here are true counts (a <c>COUNT(*)</c> query), not upstream's
/// <c>.limit(50).length</c>, which silently caps the reported number at 50 even when more rows exist.
/// </summary>
public sealed record IrdQueueHealthDto(
    int PendingCount,
    int FailedCount,
    int SalesFailedCount,
    IReadOnlyList<IrdFailedQueueItemDto> RecentFailed);

/// <summary>
/// One row of the Next.js reference's <c>sales-register</c> (and <c>annex-13</c>) IRD report types
/// (<c>getIrdReportRows</c> in reports-service.ts). Serves both report types — their legacy field sets
/// are the same sales rows, just reordered/relabelled for the two CSV layouts (the frontend picks the
/// column order per type). <b>Faithfulness gap</b> — the ported <c>Sale</c> entity has no
/// <c>sale_number</c> and no separate stored tax breakdown (VAT is computed on-the-fly by Accounting
/// from posted vouchers, not persisted per-sale), so <see cref="TaxAmount"/> is always <c>null</c> here
/// rather than invented; <see cref="DiscountAmount"/> IS derivable (sum of each line's
/// <c>SaleItem.DiscountAmount</c>) and is included. <c>Customer</c> does carry phone/email, so those are
/// included unlike an earlier version of this DTO assumed.
/// </summary>
public sealed record IrdSalesRegisterRowDto(
    Guid SaleId,
    string? InvoiceNumber,
    DateTime SaleDateUtc,
    decimal TotalAmount,
    decimal? TaxAmount,
    decimal DiscountAmount,
    string PaymentMethod,
    string IrdStatus,
    Guid? CustomerId,
    string CustomerName,
    string? CustomerPhone,
    string? CustomerEmail,
    // VAT-exclusive value of the taxable lines and total of the VAT-exempt lines, so
    // TaxableAmount + TaxAmount + ExemptAmount = TotalAmount. Taken from the breakdown stored at sale
    // time; for older sales without one it is derived from the VAT (taxable = VAT ÷ rate). Null only when
    // the VAT itself is unknown.
    decimal? TaxableAmount = null,
    decimal? ExemptAmount = null,
    // "sale" (the invoice, in the period it was issued, even if later cancelled), or a reversal dated when it
    // happened: "cancellation" (the whole invoice voided), "return" / "refund" (a credit note). Reversal rows
    // carry NEGATIVE amounts, so the register's totals for a period match what the VAT return reports for it.
    string RowType = IrdRegisterRowTypes.Sale,
    // The reversal's own document: the credit-note number (returns/refunds) or the voided invoice number
    // (cancellations). Null on sale rows.
    string? DocumentNumber = null,
    // For reversal rows, the invoice being reversed.
    string? OriginalInvoiceNumber = null);

/// <summary>Values of <see cref="IrdSalesRegisterRowDto.RowType"/>.</summary>
public static class IrdRegisterRowTypes
{
    public const string Sale = "sale";
    public const string Cancellation = "cancellation";
    public const string Return = "return";
    public const string Refund = "refund";
}

/// <summary>Result of a manual IRD resend: the queue row, now Pending again.</summary>
public sealed record IrdResendResultDto(Guid QueueItemId, Guid SaleId, string DocumentType, string Status);

/// <summary>
/// One bill in IRD's materialized view (the columns IRD's e-billing guidelines list for a billing system's sales
/// register). Amounts are NPR; <see cref="Amount"/> is the gross before discount, <see cref="TotalAmount"/> what the
/// buyer paid (= <see cref="TaxableAmount"/> + <see cref="TaxAmount"/> + <see cref="ExemptAmount"/>).
/// <see cref="BillDate"/> is BS <c>yyyy.mm.dd</c>; <see cref="FiscalYear"/> is "2083/84".
/// <see cref="VatRefundAmount"/> is the VAT given back on credit notes (returns / refunds) against the bill;
/// <see cref="TransactionId"/> the payment references (e.g. Fonepay trace ids), comma-separated.
/// <see cref="EnteredBy"/> / <see cref="PrintedBy"/> are user names (or ids when the user no longer exists).
/// </summary>
public sealed record IrdBillRegisterRowDto(
    Guid SaleId,
    string FiscalYear,
    string BillNo,
    string CustomerName,
    string? CustomerPan,
    string BillDate,
    DateTime BillDateUtc,
    decimal Amount,
    decimal Discount,
    decimal TaxableAmount,
    decimal TaxAmount,
    decimal ExemptAmount,
    decimal TotalAmount,
    bool SyncWithIrd,
    bool IsBillPrinted,
    bool IsBillActive,
    DateTime? PrintedTimeUtc,
    string? EnteredBy,
    string? PrintedBy,
    bool? IsRealtime,
    string PaymentMethod,
    decimal VatRefundAmount,
    string? TransactionId,
    int PrintCount,
    string IrdStatus,
    string InvoiceType);

/// <summary>Values of <see cref="IrdBillRegisterRowDto.InvoiceType"/>.</summary>
public static class IrdInvoiceTypes
{
    public const string TaxInvoice = "tax_invoice";
    public const string AbbreviatedTaxInvoice = "abbreviated_tax_invoice";

    /// <summary>
    /// IRD rule: without a buyer PAN, a sale up to (and including) the threshold may be issued as an Abbreviated Tax
    /// Invoice; a buyer PAN, or a larger amount, needs a full Tax Invoice carrying the buyer's name (and PAN).
    /// </summary>
    public static string For(decimal total, string? buyerPan, decimal threshold) =>
        string.IsNullOrWhiteSpace(buyerPan) && total <= threshold ? AbbreviatedTaxInvoice : TaxInvoice;
}
