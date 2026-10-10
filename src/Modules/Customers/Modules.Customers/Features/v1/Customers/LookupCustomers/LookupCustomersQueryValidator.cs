using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;

namespace FSH.Modules.Customers.Features.v1.Customers.LookupCustomers;

public sealed class LookupCustomersQueryValidator : AbstractValidator<LookupCustomersQuery>
{
    public LookupCustomersQueryValidator()
    {
        RuleFor(x => x.MaxResults).InclusiveBetween(1, LookupCustomersQuery.MaxIds);
        RuleFor(x => x.Search).MaximumLength(200);
        RuleFor(x => x.CustomerIds!.Count)
            .LessThanOrEqualTo(LookupCustomersQuery.MaxIds)
            .When(x => x.CustomerIds is not null);
    }
}
