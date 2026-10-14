using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Expenses;

namespace FSH.Modules.Accounting.Features.v1.Expenses.SearchExpenses;

public sealed class SearchExpensesQueryValidator : AbstractValidator<SearchExpensesQuery>
{
    public SearchExpensesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.DateToUtc)
            .GreaterThanOrEqualTo(x => x.DateFromUtc)
            .When(x => x.DateFromUtc.HasValue && x.DateToUtc.HasValue)
            .WithMessage("The end date must be on or after the start date.");
    }
}
