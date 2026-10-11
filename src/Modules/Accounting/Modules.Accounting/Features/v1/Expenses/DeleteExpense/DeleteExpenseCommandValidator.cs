using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Expenses;

namespace FSH.Modules.Accounting.Features.v1.Expenses.DeleteExpense;

public sealed class DeleteExpenseCommandValidator : AbstractValidator<DeleteExpenseCommand>
{
    public DeleteExpenseCommandValidator()
    {
        RuleFor(x => x.ExpenseId).NotEmpty();
    }
}
