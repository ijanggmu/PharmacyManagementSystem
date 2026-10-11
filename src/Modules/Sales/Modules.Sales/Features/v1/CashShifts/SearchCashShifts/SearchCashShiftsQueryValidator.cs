using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.CashShifts;

namespace FSH.Modules.Sales.Features.v1.CashShifts.SearchCashShifts;

public sealed class SearchCashShiftsQueryValidator : AbstractValidator<SearchCashShiftsQuery>
{
    public SearchCashShiftsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
