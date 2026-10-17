namespace FSH.Modules.Purchasing.Contracts.Dtos;

/// <summary>
/// One row of the Next.js reference's <c>purchase-register</c> (and <c>annex-14</c>) IRD report types
/// (<c>getIrdReportRows</c> in reports-service.ts, served by GET
/// <c>/api/reports/ird?type=purchase-register|annex-14</c>). Serves both report types — their legacy
/// field sets are the same purchase-order rows, just reordered/relabelled for the two CSV layouts (the
/// frontend picks the column order per type).
///
/// <b>Faithfulness gap</b> — the ported <c>PurchaseOrder</c> entity has no stored <c>order_number</c>
/// (upstream's internal PO number); <see cref="OrderId"/> is the only identifier available and is
/// surfaced instead of inventing one. Upstream aggregated <c>supplier_tax_invoice_numbers</c> across
/// every goods receipt linked to the order; this port exposes the single
/// <c>PurchaseOrder.SupplierInvoiceNumber</c> captured on the order itself (there is one invoice-number
/// field per order in this schema, not a list). <c>PurchaseOrder</c> has no <c>BranchId</c> column
/// (unlike <c>DirectGoodsReceipt</c>), so this report is tenant-wide, not branch-scoped — a schema gap,
/// not an oversight.
///
/// Only received orders are listed, dated by their receipt (bill) date. Rows also come from received
/// <c>DirectGoodsReceipt</c>s (purchases without a PO); for those <see cref="OrderId"/> is the receipt
/// id. For both, <see cref="OrderDateUtc"/> is the bill date, <see cref="TotalAmount"/> the gross
/// (net + VAT) amount, <see cref="TaxableAmount"/> the net and <see cref="VatAmount"/> the input VAT;
/// <see cref="Source"/> tells the two apart.
///
/// <see cref="TaxableAmount"/> is the VAT-bearing net only; the net of lines that carried no input VAT
/// (VAT-exempt medicines) is <see cref="ExemptAmount"/>, so the two add up to the row's net purchase.
/// A voided direct receipt keeps its original row in the period it was received in and gets a
/// negative <see cref="DirectGoodsReceiptVoidSource"/> row dated at the void, like a debit note.
/// </summary>
public sealed record IrdPurchaseRegisterRowDto(
    Guid OrderId,
    DateTime OrderDateUtc,
    Guid SupplierId,
    string SupplierName,
    string? SupplierInvoiceNumber,
    decimal TotalAmount,
    string Status,
    string Source = IrdPurchaseRegisterRowDto.PurchaseOrderSource,
    decimal TaxableAmount = 0m,
    decimal VatAmount = 0m,
    decimal ExemptAmount = 0m,
    string? DocumentNumber = null)
{
    public const string PurchaseOrderSource = "PurchaseOrder";
    public const string DirectGoodsReceiptSource = "DirectGoodsReceipt";

    /// <summary>A supplier return: amounts are negative (purchases and input VAT reduced).</summary>
    public const string DebitNoteSource = "DebitNote";

    /// <summary>The reversal of a voided direct goods receipt, dated at the void: amounts are negative.</summary>
    public const string DirectGoodsReceiptVoidSource = "DirectGoodsReceiptVoid";
}
