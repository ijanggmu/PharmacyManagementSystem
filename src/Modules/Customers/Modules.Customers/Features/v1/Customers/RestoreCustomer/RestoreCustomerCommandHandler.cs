using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;

namespace FSH.Modules.Customers.Features.v1.Customers.RestoreCustomer;

public sealed class RestoreCustomerCommandHandler(CustomersDbContext dbContext)
    : ICommandHandler<RestoreCustomerCommand, Guid>
{
    public async ValueTask<Guid> Handle(RestoreCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await CustomerWrites.ExecuteAsync(dbContext, async ct =>
        {
            var customer = await CustomerWrites.LockAndLoadAsync(dbContext, command.CustomerId, ct, includeDeleted: true)
                .ConfigureAwait(false)
                ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

            customer.Restore();
            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            return customer.Id;
        }, cancellationToken).ConfigureAwait(false);
    }
}
