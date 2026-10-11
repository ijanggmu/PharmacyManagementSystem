using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;

namespace FSH.Modules.Customers.Features.v1.Customers.RestoreCustomer;

public sealed class RestoreCustomerCommandValidator : AbstractValidator<RestoreCustomerCommand>
{
    public RestoreCustomerCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
    }
}
