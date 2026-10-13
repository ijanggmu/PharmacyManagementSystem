namespace FSH.Modules.Purchasing.Contracts.Dtos;

/// <summary>
/// Purchase side of the IRD monthly VAT return, from the IRD purchase register (<c>GetPurchaseVatSummaryQuery</c>).
/// Gross figures cover bills (received orders and direct receipts) dated in the period; the <c>DebitNotes*</c>
/// figures are the reductions recorded in the period — supplier debit notes and voids of direct receipts — as
/// POSITIVE amounts to subtract. Taxable values are VAT-exclusive; a line that carried no input VAT is exempt.
/// The system has no import purchase type (no customs/import VAT), so <see cref="ImportPurchases"/> and
/// <see cref="ImportVat"/> are always 0 for now; they are part of the contract so the return keeps IRD's layout.
/// </summary>
public sealed record PurchaseVatSummaryDto(
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    int BillCount,
    decimal TaxablePurchases,
    decimal ExemptPurchases,
    decimal InputVat,
    decimal ImportPurchases,
    decimal ImportVat,
    // Supplier debit notes + voided direct receipts recorded in the period.
    int DebitNoteCount,
    decimal DebitNotesTaxable,
    decimal DebitNotesExempt,
    decimal DebitNotesVat);
