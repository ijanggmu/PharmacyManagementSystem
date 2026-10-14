using System.Globalization;
using System.Net;
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

            // A correction is recorded exactly as asked, or refused: never silently clamped.
            if (!customer.IsMember)
            {
                throw Conflict($"{customer.Name} is not a loyalty member, so their points can't be adjusted. Enrol them first.");
            }

            if (command.Points < 0 && -command.Points > customer.LoyaltyPoints)
            {
                throw Conflict(string.Create(CultureInfo.InvariantCulture,
                    $"{customer.Name} has only {customer.LoyaltyPoints} points; {-command.Points} can't be taken off."));
            }

            int balance = customer.ApplyLoyaltyPoints(command.Points, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.Adjust, applied, balance, command.Reason));

            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
            return balance;
        }, cancellationToken).ConfigureAwait(false);
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}
