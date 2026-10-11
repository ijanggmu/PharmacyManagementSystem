using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;

namespace FSH.Modules.Customers.Features.v1.Customers.ListTrashedCustomers;

public sealed class ListTrashedCustomersQueryValidator : AbstractValidator<ListTrashedCustomersQuery>
{
    public ListTrashedCustomersQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
