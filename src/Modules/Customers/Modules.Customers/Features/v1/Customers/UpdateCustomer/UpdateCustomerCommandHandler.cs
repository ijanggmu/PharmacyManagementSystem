using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;

public sealed class UpdateCustomerCommandHandler(CustomersDbContext dbContext)
    : ICommandHandler<UpdateCustomerCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(c => c.Id == command.CustomerId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

        customer.Update(command.Name, command.Phone, command.Email, command.Address, command.IsActive);
        if (command.Allergies is not null)
        {
            customer.SetAllergies(command.Allergies);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return customer.Id;
    }
}
