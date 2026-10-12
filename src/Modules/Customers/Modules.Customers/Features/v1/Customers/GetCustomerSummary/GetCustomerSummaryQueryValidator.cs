using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerSummary;

public sealed class GetCustomerSummaryQueryValidator : AbstractValidator<GetCustomerSummaryQuery>
{
    public GetCustomerSummaryQueryValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
    }
}
