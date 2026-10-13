using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Services;
using Mediator;

namespace FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;

public sealed class UpdateCustomerCommandHandler(CustomersDbContext dbContext, ICustomerCreditPermissionGuard creditPermission)
    : ICommandHandler<UpdateCustomerCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateCustomerCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await CustomerWrites.ExecuteAsync(dbContext, async ct =>
        {
            // Locked like every other customer write, so a profile edit never races a balance update.
            var customer = await CustomerWrites.LockAndLoadAsync(dbContext, command.CustomerId, ct)
                .ConfigureAwait(false)
                ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

            // Only an actual change of the limit needs the credit permission: the web form re-sends the
            // stored limit with every profile save.
            decimal? requestedLimit = command.ClearCreditLimit ? null : command.CreditLimit ?? customer.CreditLimit;
            if (requestedLimit != customer.CreditLimit)
            {
                await creditPermission.EnsureCanManageCreditAsync(ct).ConfigureAwait(false);
                customer.SetCreditLimit(requestedLimit);
            }

            // Payment terms are credit terms: changing them needs the same permission as the limit.
            int? requestedDays = command.ClearCreditDays ? null : command.CreditDays ?? customer.CreditDays;
            if (requestedDays != customer.CreditDays)
            {
                await creditPermission.EnsureCanManageCreditAsync(ct).ConfigureAwait(false);
                customer.SetCreditDays(requestedDays);
            }

            customer.Update(command.Name, command.Phone, command.Email, command.Address, command.IsActive);
            if (command.IsMember is { } isMember)
            {
                customer.SetMembership(isMember);
            }

            if (command.Allergies is not null)
            {
                customer.SetAllergies(command.Allergies);
            }

            if (command.ChronicConditions is not null)
            {
                customer.SetChronicConditions(command.ChronicConditions);
            }

            if (command.CurrentMedications is not null)
            {
                customer.SetCurrentMedications(command.CurrentMedications);
            }

            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            return customer.Id;
        }, cancellationToken).ConfigureAwait(false);
    }
}
