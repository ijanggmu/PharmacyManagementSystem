using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.DeleteCustomer;

public sealed class DeleteCustomerCommandHandler(CustomersDbContext dbContext)
    : ICommandHandler<DeleteCustomerCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeleteCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(c => c.Id == command.CustomerId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

        dbContext.Customers.Remove(customer);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}
