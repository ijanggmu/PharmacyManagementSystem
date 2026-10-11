using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Reports;

namespace FSH.Modules.Sales.Features.v1.Reports.GetMedicineSalesAggregate;

public sealed class GetMedicineSalesAggregateQueryValidator : AbstractValidator<GetMedicineSalesAggregateQuery>
{
    public GetMedicineSalesAggregateQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc)
            .WithMessage("toUtc must be on or after fromUtc.");
    }
}
