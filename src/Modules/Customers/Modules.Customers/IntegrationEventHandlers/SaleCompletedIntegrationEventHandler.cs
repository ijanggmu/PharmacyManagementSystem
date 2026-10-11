using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Loyalty;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Events;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>
/// A completed sale's effect on the customer's accounts:
/// <list type="bullet">
/// <item>the AR ledger entry for a credit sale's balance due (a no-op when paid in full);</item>
/// <item>loyalty: points redeemed on the sale are taken off, and a member earns points on the sale
/// total when the programme is on.</item>
/// </list>
/// Sales now applies the AR entry and the redemption synchronously, inside the sale's own transaction
/// (<c>ICustomerSalePostingService</c>), so both are normally already there when this runs; each is applied
/// here only when no entry for the sale exists yet (sales recorded before that change, still in the outbox).
/// Earning stays here, asynchronous.
/// Stamps entries with the originating sale's own <see cref="SaleCompletedIntegrationEvent.BranchId"/>
/// rather than resolving one ambiently — this handler runs off the Outbox/background dispatcher, which
/// has no per-request branch context (see docs/branch-scoping-plan.md wave-2 notes).
/// </summary>
public sealed class SaleCompletedIntegrationEventHandler(CustomersDbContext dbContext, IMediator mediator)
    : IIntegrationEventHandler<SaleCompletedIntegrationEvent>
{
    public async Task HandleAsync(SaleCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.CustomerId is not { } customerId)
        {
            return;
        }

        bool onAccount = @event.BalanceDue > 0;
        bool redeemed = @event.LoyaltyPointsRedeemed > 0;

        // Settings only matter for earning; read them before touching the customer.
        var loyalty = LoyaltySettings.From(
            await mediator.Send(new GetTenantSettingsQuery(LoyaltySettings.Category), ct).ConfigureAwait(false));

        if (!onAccount && !redeemed && !loyalty.Enabled)
        {
            return;
        }

        var customer = await dbContext.Customers
            .FirstOrDefaultAsync(c => c.Id == customerId, ct)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {customerId} not found.");

        string saleLabel = $"Sale {@event.InvoiceNumber ?? @event.SaleId.ToString()}";

        if (onAccount)
        {
            onAccount = !await dbContext.CustomerLedgerEntries
                .AnyAsync(e => e.ReferenceType == CustomerSalePostingService.SaleReferenceType && e.ReferenceId == @event.SaleId, ct)
                .ConfigureAwait(false);
        }

        if (redeemed)
        {
            redeemed = !await dbContext.CustomerLoyaltyEntries
                .AnyAsync(e => e.SaleId == @event.SaleId && e.EntryType == LoyaltyEntryType.Redeem, ct)
                .ConfigureAwait(false);
        }

        if (onAccount)
        {
            // A sale on account increases what the customer owes: debit side of the AR ledger.
            decimal newBalance = customer.ApplyLedgerEntry(debitAmount: @event.BalanceDue, creditAmount: 0m);
            dbContext.CustomerLedgerEntries.Add(CustomerLedgerEntry.Create(
                customer.Id, DateTime.UtcNow, CustomerLedgerEntryType.Sale,
                saleLabel, debitAmount: @event.BalanceDue, creditAmount: 0m,
                runningBalance: newBalance, referenceType: "Sale", referenceId: @event.SaleId, branchId: @event.BranchId,
                documentNumber: @event.InvoiceNumber));
        }

        if (redeemed)
        {
            int balance = customer.ApplyLoyaltyPoints(-@event.LoyaltyPointsRedeemed, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.Redeem, applied, balance, $"Redeemed on {saleLabel}", @event.SaleId, @event.BranchId));
        }

        // Members earn on what the sale came to after discounts (including any points redeemed).
        int earned = customer.IsMember ? loyalty.PointsEarnedOn(@event.TotalAmount) : 0;
        if (earned > 0)
        {
            int balance = customer.ApplyLoyaltyPoints(earned, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.Earn, applied, balance, $"Earned on {saleLabel}", @event.SaleId, @event.BranchId));
        }

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }
}
