using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using Mediator;

namespace FSH.Modules.Customers.Features.v1.Customers.DeleteCustomer;

/// <summary>
/// Moves a customer to the trash (soft delete). Refused while the customer still has an account
/// balance: a trashed customer drops out of the customer list, lookups and the sale screen, so money
/// they owe (or are owed) would otherwise become invisible to the people who collect or settle it.
/// </summary>
public sealed class DeleteCustomerCommandHandler(CustomersDbContext dbContext)
    : ICommandHandler<DeleteCustomerCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeleteCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await CustomerWrites.ExecuteAsync(dbContext, async ct =>
        {
            // Locked so a sale on account or a payment can't change the balance between the check and the delete.
            var customer = await CustomerWrites.LockAndLoadAsync(dbContext, command.CustomerId, ct)
                .ConfigureAwait(false)
                ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

            if (customer.CurrentBalance != 0m)
            {
                string message = customer.CurrentBalance > 0
                    ? string.Create(CultureInfo.InvariantCulture,
                        $"{customer.Name} still owes {customer.CurrentBalance:N2}. Record their payment (or settle the balance) before deleting them.")
                    : string.Create(CultureInfo.InvariantCulture,
                        $"{customer.Name} has a credit of {-customer.CurrentBalance:N2} on account. Settle it before deleting them.");
                throw new CustomException(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            dbContext.Customers.Remove(customer);
            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            return Unit.Value;
        }, cancellationToken).ConfigureAwait(false);
    }
}
