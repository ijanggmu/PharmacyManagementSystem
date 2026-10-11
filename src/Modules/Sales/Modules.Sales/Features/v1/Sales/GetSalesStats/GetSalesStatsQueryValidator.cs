using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Sales;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSalesStats;

public sealed class GetSalesStatsQueryValidator : AbstractValidator<GetSalesStatsQuery>
{
    public GetSalesStatsQueryValidator()
    {
        RuleFor(x => x.DateToUtc).GreaterThanOrEqualTo(x => x.DateFromUtc);
    }
}
