using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Accounts;

namespace FSH.Modules.Accounting.Features.v1.Accounts.SearchAccounts;

public sealed class SearchAccountsQueryValidator : AbstractValidator<SearchAccountsQuery>
{
    public SearchAccountsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 500);
    }
}
