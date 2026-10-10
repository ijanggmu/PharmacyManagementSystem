using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.RestoreCustomer;

public sealed class RestoreCustomerCommandHandler(CustomersDbContext dbContext)
    : ICommandHandler<RestoreCustomerCommand, Guid>
{
    public async ValueTask<Guid> Handle(RestoreCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var customer = await dbContext.Customers
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .FirstOrDefaultAsync(c => c.Id == command.CustomerId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

        customer.Restore();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return customer.Id;
    }
}
