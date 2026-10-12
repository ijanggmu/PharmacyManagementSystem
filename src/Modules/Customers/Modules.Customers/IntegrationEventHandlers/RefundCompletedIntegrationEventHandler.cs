using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Sales.Contracts.Events;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>
/// A completed refund's effect on the customer's account: the part credited to the account
/// (<see cref="RefundCompletedIntegrationEvent.AccountCreditAmount"/> — what they still owed on a credit
/// sale, or a store-credit refund) comes off their balance as a credit entry on the AR ledger. The part
/// paid out in cash never touches the ledger.
/// Stamps the entry with the refund's own branch: this runs off the Outbox, with no request branch.
/// </summary>
public sealed class RefundCompletedIntegrationEventHandler(CustomersDbContext dbContext)
    : IIntegrationEventHandler<RefundCompletedIntegrationEvent>
{
    private const string ReferenceType = "Refund";

    public async Task HandleAsync(RefundCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.CustomerId is not { } customerId || @event.AccountCreditAmount <= 0)
        {
            return;
        }

        // Idempotent: the event can be redelivered (the inbox mark commits separately from this handler).
        bool alreadyApplied = await dbContext.CustomerLedgerEntries.AsNoTracking()
            .AnyAsync(e => e.ReferenceType == ReferenceType && e.ReferenceId == @event.RefundId, ct)
            .ConfigureAwait(false);
        if (alreadyApplied)
        {
            return;
        }

        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(c => c.Id == customerId, ct)
            .ConfigureAwait(false);
        if (customer is null)
        {
            return;
        }

        decimal newBalance = customer.ApplyLedgerEntry(debitAmount: 0m, creditAmount: @event.AccountCreditAmount);
        dbContext.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
            customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Refund,
            "Refund credited to account", debitAmount: 0m, creditAmount: @event.AccountCreditAmount,
            runningBalance: newBalance, referenceType: ReferenceType, referenceId: @event.RefundId, branchId: @event.BranchId));

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
