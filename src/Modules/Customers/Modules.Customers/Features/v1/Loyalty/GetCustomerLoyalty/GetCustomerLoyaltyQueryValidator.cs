using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Loyalty;

namespace FSH.Modules.Customers.Features.v1.Loyalty.GetCustomerLoyalty;

public sealed class GetCustomerLoyaltyQueryValidator : AbstractValidator<GetCustomerLoyaltyQuery>
{
    public GetCustomerLoyaltyQueryValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Take).InclusiveBetween(1, 200);
    }
}
