namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>
/// One open supplier bill for payment scheduling. <see cref="Status"/> is <c>overdue</c>, <c>due_soon</c> (due
/// today or within the window), <c>later</c> or <c>no_due_date</c>. <see cref="DaysOverdue"/> is positive when
/// overdue, 0 when due today, negative for days still to go, null without a due date. <see cref="AgeDays"/> counts
/// from the bill date. <see cref="ReferenceType"/>/<see cref="ReferenceId"/> target the bill when paying it.
/// </summary>
public sealed record PayableDueBillDto(
    Guid SupplierId,
    string SupplierName,
    Guid LedgerEntryId,
    DateTime BillDateUtc,
    string ReferenceType,
    Guid ReferenceId,
    string? DocumentNumber,
    string? SupplierBillNumber,
    decimal Outstanding,
    DateTime? DueDateUtc,
    int? DaysOverdue,
    int AgeDays,
    string Status,
    Guid? BranchId);

/// <summary>A supplier's open bills summed by schedule status. <see cref="CreditDays"/> is the supplier's
/// current default terms (null = none).</summary>
public sealed record PayablesDueSupplierDto(
    Guid SupplierId,
    string SupplierName,
    int? CreditDays,
    decimal Overdue,
    decimal DueSoon,
    decimal Later,
    decimal NoDueDate,
    decimal Total,
    int OverdueBillCount,
    int DueSoonBillCount,
    DateTime? EarliestDueDateUtc);

/// <summary>Payables due as of <see cref="AsOfUtc"/>, the due-soon window being <see cref="WithinDays"/> days.
/// <see cref="Suppliers"/> lists suppliers with something overdue or due soon (every supplier with an open bill
/// when all bills were asked for), most overdue first; <see cref="Bills"/> the matching bills, earliest due first.</summary>
public sealed record PayablesDueDto(
    DateTime AsOfUtc,
    int WithinDays,
    decimal TotalOverdue,
    decimal TotalDueSoon,
    decimal TotalLater,
    decimal TotalNoDueDate,
    IReadOnlyList<PayablesDueSupplierDto> Suppliers,
    IReadOnlyList<PayableDueBillDto> Bills);
