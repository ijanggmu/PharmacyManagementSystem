using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Expenses;

namespace FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;

public sealed class RecordExpenseCommandValidator : AbstractValidator<RecordExpenseCommand>
{
    public RecordExpenseCommandValidator()
    {
        RuleFor(x => x.Category).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Amount).GreaterThan(0m);
        RuleFor(x => x.PaymentMethod).NotEmpty().MaximumLength(32);
        RuleFor(x => x.Description).MaximumLength(1024);
        RuleFor(x => x.ReceiptReference).MaximumLength(128);
    }
}
