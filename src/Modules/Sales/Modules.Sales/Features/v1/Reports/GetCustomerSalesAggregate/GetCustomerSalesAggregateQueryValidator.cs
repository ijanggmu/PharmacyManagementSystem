using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Reports;

namespace FSH.Modules.Sales.Features.v1.Reports.GetCustomerSalesAggregate;

public sealed class GetCustomerSalesAggregateQueryValidator : AbstractValidator<GetCustomerSalesAggregateQuery>
{
    public GetCustomerSalesAggregateQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc)
            .WithMessage("toUtc must be on or after fromUtc.");
    }
}
