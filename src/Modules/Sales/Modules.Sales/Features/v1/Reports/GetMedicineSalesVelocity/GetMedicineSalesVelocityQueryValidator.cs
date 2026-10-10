using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Reports;

namespace FSH.Modules.Sales.Features.v1.Reports.GetMedicineSalesVelocity;

public sealed class GetMedicineSalesVelocityQueryValidator : AbstractValidator<GetMedicineSalesVelocityQuery>
{
    public GetMedicineSalesVelocityQueryValidator()
    {
        RuleFor(x => x.MedicineIds).NotNull();
        RuleFor(x => x.WindowDays).InclusiveBetween(1, 365);
    }
}
