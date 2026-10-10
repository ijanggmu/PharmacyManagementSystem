using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.SearchOpeningBalanceHistory;

public sealed class SearchOpeningBalanceHistoryQueryValidator : AbstractValidator<SearchOpeningBalanceHistoryQuery>
{
    public SearchOpeningBalanceHistoryQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}
