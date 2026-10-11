using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Loyalty.AdjustLoyaltyPoints;

/// <summary>Staff correction of a customer's points; returns the new balance.</summary>
public sealed class AdjustLoyaltyPointsCommandHandler(CustomersDbContext dbContext)
    : ICommandHandler<AdjustLoyaltyPointsCommand, int>
{
    public async ValueTask<int> Handle(AdjustLoyaltyPointsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await CustomerWrites.ExecuteAsync(dbContext, async ct =>
        {
            // Locked so a concurrent sale's earn/redeem can't interleave with this read-modify-write.
            var customer = await CustomerWrites.LockAndLoadAsync(dbContext, command.CustomerId, ct)
                .ConfigureAwait(false)
                ?? throw new NotFoundException($"Customer {command.CustomerId} not found.");

            int balance = customer.ApplyLoyaltyPoints(command.Points, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.Adjust, applied, balance, command.Reason));

            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            return balance;
        }, cancellationToken).ConfigureAwait(false);
    }
}
