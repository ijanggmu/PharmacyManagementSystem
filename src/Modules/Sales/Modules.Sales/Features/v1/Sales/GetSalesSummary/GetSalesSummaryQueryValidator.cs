using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Sales;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSalesSummary;

public sealed class GetSalesSummaryQueryValidator : AbstractValidator<GetSalesSummaryQuery>
{
    public GetSalesSummaryQueryValidator()
    {
        RuleFor(x => x.TodayStartUtc)
            .NotEqual(default(DateTime))
            .When(x => x.TodayStartUtc.HasValue);
    }
}
