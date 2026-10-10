using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Reports;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetCategoryPerformance;

public sealed class GetCategoryPerformanceQueryValidator : AbstractValidator<GetCategoryPerformanceQuery>
{
    public GetCategoryPerformanceQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc)
            .WithMessage("toUtc must be on or after fromUtc.");
    }
}
