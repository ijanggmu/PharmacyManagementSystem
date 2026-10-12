using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Sales.Contracts.Events;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>
/// Undoes a cancelled sale's effect on the customer's accounts, from what
/// <see cref="SaleCompletedIntegrationEventHandler"/> recorded for it:
/// <list type="bullet">
/// <item>the balance put on account is taken off again (an offsetting credit on the AR ledger);</item>
/// <item>points earned on the sale are taken back, and points spent on it are given back.</item>
/// </list>
/// A sale with a return or refund can't be cancelled, so nothing here overlaps a refund's account credit.
/// </summary>
public sealed class SaleCancelledIntegrationEventHandler(CustomersDbContext dbContext)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    private const string CancelReference = "SaleCancel";

    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var saleEntry = await dbContext.CustomerLedgerEntries.AsNoTracking()
            .FirstOrDefaultAsync(e => e.EntryType == CustomerLedgerEntryType.Sale
                && e.ReferenceType == "Sale" && e.ReferenceId == @event.SaleId, ct)
            .ConfigureAwait(false);
        var loyalty = await dbContext.CustomerLoyaltyEntries.AsNoTracking()
            .Where(e => e.SaleId == @event.SaleId && e.RefundId == null)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        Guid? customerId = saleEntry?.CustomerId ?? loyalty.FirstOrDefault()?.CustomerId;
        if (customerId is null)
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

        // Idempotent per part: the event can be redelivered (the inbox mark commits separately).
        bool ledgerDone = await dbContext.CustomerLedgerEntries.AsNoTracking()
            .AnyAsync(e => e.ReferenceType == CancelReference && e.ReferenceId == @event.SaleId, ct)
            .ConfigureAwait(false);
        if (saleEntry is { DebitAmount: > 0 } && !ledgerDone)
        {
            decimal newBalance = customer.ApplyLedgerEntry(debitAmount: 0m, creditAmount: saleEntry.DebitAmount);
            dbContext.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
                customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Adjustment,
                $"{saleEntry.Description ?? "Sale"} cancelled", debitAmount: 0m, creditAmount: saleEntry.DebitAmount,
                runningBalance: newBalance, referenceType: CancelReference, referenceId: @event.SaleId,
                branchId: @event.BranchId ?? saleEntry.BranchId, documentNumber: saleEntry.DocumentNumber));
        }

        var earned = loyalty.FirstOrDefault(e => e.EntryType == LoyaltyEntryType.Earn);
        if (earned is { Points: > 0 } && !loyalty.Any(e => e.EntryType == LoyaltyEntryType.EarnReversed))
        {
            // Points already spent can't be taken back below zero; ApplyLoyaltyPoints caps at the balance.
            int balance = customer.ApplyLoyaltyPoints(-earned.Points, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.EarnReversed, applied, balance, "Sale cancelled: earned points taken back",
                @event.SaleId, @event.BranchId ?? earned.BranchId));
        }

        var redeemed = loyalty.FirstOrDefault(e => e.EntryType == LoyaltyEntryType.Redeem);
        if (redeemed is { Points: not 0 } && !loyalty.Any(e => e.EntryType == LoyaltyEntryType.RedeemReturned))
        {
            // Redeem entries store a negative point movement; give back the same number of points.
            int points = Math.Abs(redeemed.Points);
            int balance = customer.ApplyLoyaltyPoints(points, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.RedeemReturned, applied, balance, "Sale cancelled: spent points given back",
                @event.SaleId, @event.BranchId ?? redeemed.BranchId));
        }

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
