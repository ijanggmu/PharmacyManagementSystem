namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>
/// One payable on a supplier's account and how much of it is settled. <see cref="ReferenceType"/> /
/// <see cref="ReferenceId"/> identify the bill — pass them as <c>billReferenceType</c> /
/// <c>billReferenceId</c> to record a payment against this bill only. Reference types: <c>DirectGoodsReceipt</c>,
/// <c>PurchaseOrder</c>, <c>ConsignmentSettlement</c>, <c>MedicineStockReceipt</c>, <c>Expense</c> (a pay-later expense; the id is the expense), or <c>LedgerEntry</c> (an opening
/// balance or adjustment; the id is the ledger entry). <see cref="Status"/> is <c>open</c>, <c>partially_paid</c> or <c>paid</c>.
/// </summary>
public sealed record SupplierBillDto(
    Guid LedgerEntryId,
    DateTime BillDateUtc,
    string EntryType,
    string ReferenceType,
    Guid ReferenceId,
    string? DocumentNumber,
    string? SupplierBillNumber,
    string? Description,
    decimal Amount,
    decimal Paid,
    decimal Credited,
    decimal Outstanding,
    string Status,
    int AgeDays,
    Guid? BranchId);

/// <summary>A supplier's bills with totals. <see cref="UnappliedCredit"/> is money paid or credited beyond every
/// bill (an advance), which settles bills recorded later.</summary>
public sealed record SupplierOpenBillsDto(
    Guid SupplierId,
    decimal TotalOutstanding,
    decimal UnappliedCredit,
    IReadOnlyList<SupplierBillDto> Bills);
