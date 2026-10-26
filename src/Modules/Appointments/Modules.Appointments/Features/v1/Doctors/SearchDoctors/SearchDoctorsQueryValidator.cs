using FluentValidation;
using FSH.Modules.Appointments.Contracts.v1.Doctors;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SearchDoctors;

public sealed class SearchDoctorsQueryValidator : AbstractValidator<SearchDoctorsQuery>
{
    public SearchDoctorsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Search).MaximumLength(200);
    }
}
