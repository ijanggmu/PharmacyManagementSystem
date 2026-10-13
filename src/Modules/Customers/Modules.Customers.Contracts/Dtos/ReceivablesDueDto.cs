namespace FSH.Modules.Customers.Contracts.Dtos;

/// <summary>
/// One open customer debt (usually a sale on account; <see cref="DocumentNumber"/> is its invoice number).
/// <see cref="Status"/> is <c>overdue</c>, <c>due_soon</c> (due today or within the window), <c>later</c> or
/// <c>no_due_date</c>. <see cref="DaysOverdue"/> is positive when overdue, 0 when due today, negative for days still
/// to go, null without a due date. <see cref="AgeDays"/> counts from the entry date.
/// </summary>
public sealed record ReceivableDueInvoiceDto(
    Guid CustomerId,
    string CustomerName,
    Guid LedgerEntryId,
    DateTime EntryDateUtc,
    string EntryType,
    string? DocumentNumber,
    string? ReferenceType,
    Guid? ReferenceId,
    decimal Outstanding,
    DateTime? DueDateUtc,
    int? DaysOverdue,
    int AgeDays,
    string Status,
    Guid? BranchId);

/// <summary>A customer's open debts summed by status. <see cref="CreditDays"/> is the customer's current terms.</summary>
public sealed record ReceivablesDueCustomerDto(
    Guid CustomerId,
    string CustomerName,
    int? CreditDays,
    decimal Overdue,
    decimal DueSoon,
    decimal Later,
    decimal NoDueDate,
    decimal Total,
    int OverdueCount,
    int DueSoonCount,
    DateTime? EarliestDueDateUtc);

/// <summary>Receivables due as of <see cref="AsOfUtc"/>. <see cref="Customers"/> lists customers with something
/// overdue or due soon (all with an open debt when everything was asked for), most overdue first;
/// <see cref="Invoices"/> the matching debts, earliest due first.</summary>
public sealed record ReceivablesDueDto(
    DateTime AsOfUtc,
    int WithinDays,
    decimal TotalOverdue,
    decimal TotalDueSoon,
    decimal TotalLater,
    decimal TotalNoDueDate,
    IReadOnlyList<ReceivablesDueCustomerDto> Customers,
    IReadOnlyList<ReceivableDueInvoiceDto> Invoices);
