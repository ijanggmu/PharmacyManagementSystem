using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Reports;

namespace FSH.Modules.Customers.Features.v1.Reports.GetTopCustomers;

public sealed class GetTopCustomersQueryValidator : AbstractValidator<GetTopCustomersQuery>
{
    public GetTopCustomersQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc)
            .WithMessage("toUtc must be on or after fromUtc.");
        RuleFor(x => x.Take).InclusiveBetween(1, 100);
    }
}
