using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Reports;

namespace FSH.Modules.Customers.Features.v1.Reports.GetCustomerGrowth;

public sealed class GetCustomerGrowthQueryValidator : AbstractValidator<GetCustomerGrowthQuery>
{
    public GetCustomerGrowthQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc)
            .WithMessage("toUtc must be on or after fromUtc.");
    }
}
