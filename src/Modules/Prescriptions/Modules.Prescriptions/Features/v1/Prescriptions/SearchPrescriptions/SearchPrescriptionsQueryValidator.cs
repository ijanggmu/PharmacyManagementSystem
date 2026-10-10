using FluentValidation;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.SearchPrescriptions;

public sealed class SearchPrescriptionsQueryValidator : AbstractValidator<SearchPrescriptionsQuery>
{
    public SearchPrescriptionsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Search).MaximumLength(200);
        RuleFor(x => x.DateTo)
            .GreaterThanOrEqualTo(x => x.DateFrom)
            .When(x => x.DateFrom.HasValue && x.DateTo.HasValue)
            .WithMessage("DateTo must be on or after DateFrom.");
    }
}
