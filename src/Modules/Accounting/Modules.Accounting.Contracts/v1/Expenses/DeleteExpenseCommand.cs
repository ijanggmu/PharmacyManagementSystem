using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Expenses;

/// <summary>Deletes an expense. Its GL voucher (if posted) is reversed first, then the expense
/// row is removed.</summary>
public sealed record DeleteExpenseCommand(Guid ExpenseId) : ICommand<Guid>;
