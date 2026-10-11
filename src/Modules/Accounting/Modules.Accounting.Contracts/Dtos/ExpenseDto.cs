namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record ExpenseDto(
    Guid Id,
    DateTime ExpenseDateUtc,
    string Category,
    decimal Amount,
    string PaymentMethod,
    string? Description,
    string RecordedBy,
    DateTime CreatedAtUtc,
    Guid? BranchId = null,
    string? ReceiptReference = null);
