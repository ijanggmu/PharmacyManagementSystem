using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Loyalty;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Events;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>
/// A completed refund's effect on the customer's accounts:
/// <list type="bullet">
/// <item>the part credited to the account (<see cref="RefundCompletedIntegrationEvent.AccountCreditAmount"/> —
/// what they still owed on a credit sale, or a store-credit refund) comes off their balance as a credit
/// entry on the AR ledger. The part paid out in cash never touches the ledger;</item>
/// <item>points earned on the money now refunded are taken back, at the same earning rule, never more than
/// the sale earned in all.</item>
/// </list>
/// Stamps entries with the refund's own branch: this runs off the Outbox, with no request branch.
/// </summary>
public sealed class RefundCompletedIntegrationEventHandler(CustomersDbContext dbContext, IMediator mediator)
    : IIntegrationEventHandler<RefundCompletedIntegrationEvent>
{
    private const string ReferenceType = "Refund";

    public async Task HandleAsync(RefundCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.CustomerId is not { } customerId || @event.NetRefundAmount <= 0)
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

        // Idempotent per part: the event can be redelivered (the inbox mark commits separately from this handler).
        if (@event.AccountCreditAmount > 0)
        {
            bool alreadyCredited = await dbContext.CustomerLedgerEntries.AsNoTracking()
                .AnyAsync(e => e.ReferenceType == ReferenceType && e.ReferenceId == @event.RefundId, ct)
                .ConfigureAwait(false);
            if (!alreadyCredited)
            {
                decimal newBalance = customer.ApplyLedgerEntry(debitAmount: 0m, creditAmount: @event.AccountCreditAmount);
                dbContext.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
                    customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Refund,
                    "Refund credited to account", debitAmount: 0m, creditAmount: @event.AccountCreditAmount,
                    runningBalance: newBalance, referenceType: ReferenceType, referenceId: @event.RefundId, branchId: @event.BranchId));
            }
        }

        await TakeBackEarnedPointsAsync(customer, @event, ct).ConfigureAwait(false);

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    private async Task TakeBackEarnedPointsAsync(Customer customer, RefundCompletedIntegrationEvent @event, CancellationToken ct)
    {
        var saleEntries = await dbContext.CustomerLoyaltyEntries.AsNoTracking()
            .Where(e => e.SaleId == @event.OriginalSaleId)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        int earned = saleEntries.Where(e => e.EntryType == LoyaltyEntryType.Earn).Sum(e => e.Points);
        if (earned <= 0 || saleEntries.Any(e => e.RefundId == @event.RefundId))
        {
            return;
        }

        // Earlier take-backs on this sale (refunds or a cancellation) are stored as negative movements.
        int alreadyTakenBack = -saleEntries.Where(e => e.EntryType == LoyaltyEntryType.EarnReversed).Sum(e => e.Points);
        var loyalty = LoyaltySettings.From(
            await mediator.Send(new GetTenantSettingsQuery(LoyaltySettings.Category), ct).ConfigureAwait(false));
        int points = Math.Min(loyalty.PointsEarnedOn(@event.NetRefundAmount), earned - alreadyTakenBack);
        if (points <= 0)
        {
            return;
        }

        int balance = customer.ApplyLoyaltyPoints(-points, out int applied);
        dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
            customer.Id, LoyaltyEntryType.EarnReversed, applied, balance, "Refund: earned points taken back",
            @event.OriginalSaleId, @event.BranchId, refundId: @event.RefundId));
    }
}
