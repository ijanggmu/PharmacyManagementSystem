using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;

namespace FSH.Modules.Customers.Features.v1.Customers.DeleteCustomer;

public sealed class DeleteCustomerCommandValidator : AbstractValidator<DeleteCustomerCommand>
{
    public DeleteCustomerCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
    }
}
