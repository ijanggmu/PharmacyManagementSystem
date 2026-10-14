using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.SearchBankDeposits;

public sealed class SearchBankDepositsQueryValidator : AbstractValidator<SearchBankDepositsQuery>
{
    public SearchBankDepositsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.DateToUtc)
            .GreaterThanOrEqualTo(x => x.DateFromUtc)
            .When(x => x.DateFromUtc.HasValue && x.DateToUtc.HasValue)
            .WithMessage("The end date must be on or after the start date.");
    }
}
