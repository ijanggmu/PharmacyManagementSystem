using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetTaxDepreciationSchedule;

public sealed class GetTaxDepreciationScheduleQueryValidator : AbstractValidator<GetTaxDepreciationScheduleQuery>
{
    public GetTaxDepreciationScheduleQueryValidator()
    {
        RuleFor(x => x.FiscalYear).InclusiveBetween(2000, 2200);
    }
}
