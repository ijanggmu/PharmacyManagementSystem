using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetDepreciationSchedule;

public sealed class GetDepreciationScheduleQueryValidator : AbstractValidator<GetDepreciationScheduleQuery>
{
    public GetDepreciationScheduleQueryValidator()
    {
        RuleFor(x => x.FiscalYear).InclusiveBetween(2000, 2200);
    }
}
