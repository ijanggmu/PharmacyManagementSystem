using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetDepreciationPreview;

public sealed class GetDepreciationPreviewQueryValidator : AbstractValidator<GetDepreciationPreviewQuery>
{
    public GetDepreciationPreviewQueryValidator()
    {
        RuleFor(x => x.FiscalYear).InclusiveBetween(2000, 2200);
        RuleFor(x => x.Month!.Value).InclusiveBetween(1, 12).When(x => x.Month is not null);
    }
}
