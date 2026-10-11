using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Expenses;

/// <summary>Updates a recorded expense. If it already posted a GL voucher, that voucher is
/// reversed and a new one posted for the updated figures — the original posted voucher is never
/// edited (rule.md §9.1).</summary>
public sealed record UpdateExpenseCommand(
    Guid ExpenseId,
    string Category,
    decimal Amount,
    string PaymentMethod,
    string? Description = null,
    string? ReceiptReference = null) : ICommand<Guid>;
