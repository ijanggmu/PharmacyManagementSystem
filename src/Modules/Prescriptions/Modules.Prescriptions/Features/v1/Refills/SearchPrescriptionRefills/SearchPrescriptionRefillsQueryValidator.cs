using FluentValidation;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;

namespace FSH.Modules.Prescriptions.Features.v1.Refills.SearchPrescriptionRefills;

public sealed class SearchPrescriptionRefillsQueryValidator : AbstractValidator<SearchPrescriptionRefillsQuery>
{
    public SearchPrescriptionRefillsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.DateTo)
            .GreaterThanOrEqualTo(x => x.DateFrom)
            .When(x => x.DateFrom is not null && x.DateTo is not null);
    }
}
