using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Expenses;

/// <summary>Updates a recorded expense. If it already posted a GL voucher, that voucher is
/// reversed (dated at the expense's original date, or the first open day when that is locked) and a
/// new one posted for the updated figures at the expense date — the original posted voucher is never
/// edited (rule.md §9.1). <paramref name="ExpenseDateUtc"/> moves the expense to another date when
/// set; omitted, the date is unchanged.</summary>
public sealed record UpdateExpenseCommand(
    Guid ExpenseId,
    string Category,
    decimal Amount,
    string PaymentMethod,
    string? Description = null,
    string? ReceiptReference = null,
    DateTime? ExpenseDateUtc = null) : ICommand<Guid>;
