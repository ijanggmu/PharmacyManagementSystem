using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Expenses;

namespace FSH.Modules.Accounting.Features.v1.Expenses.SearchExpenses;

public sealed class SearchExpensesQueryValidator : AbstractValidator<SearchExpensesQuery>
{
    public SearchExpensesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
