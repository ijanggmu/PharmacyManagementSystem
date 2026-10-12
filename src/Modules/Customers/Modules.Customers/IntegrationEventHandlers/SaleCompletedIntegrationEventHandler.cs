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
    /// <summary>The ledger <see cref="CustomerLedgerEntry.ReferenceType"/> of a sale put on account.</summary>
    public const string SaleReferenceType = "Sale";

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

        await CustomerWrites.ExecuteAsync(
            dbContext,
            async token =>
            {
                await ApplyAsync(@event, customerId, onAccount, redeemed, loyalty, token).ConfigureAwait(false);
                return true;
            },
            ct).ConfigureAwait(false);
    }

    private async ValueTask ApplyAsync(
        SaleCompletedIntegrationEvent @event, Guid customerId, bool onAccount, bool redeemed, LoyaltySettings loyalty,
        CancellationToken ct)
    {
        // A customer deleted after the sale still owes what the sale put on account, so the soft-delete
        // filter is lifted here (tenant isolation stays on). Locked: a concurrent payment or sale must
        // not interleave with this read-modify-write of the balance and points.
        var customer = await CustomerWrites.LockAndLoadAsync(dbContext, customerId, ct, includeDeleted: true)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {customerId} not found.");

        // Redelivery guard: the inbox is marked only after this handler commits, so a crash in between
        // replays the event. Whatever was already applied for this sale is skipped (the unique indexes
        // on the ledger/loyalty tables are the database-level backstop).
        bool saleAlreadyOnAccount = onAccount && await dbContext.CustomerLedgerEntries
            .AnyAsync(e => e.EntryType == CustomerLedgerEntryType.Sale && e.ReferenceType == SaleReferenceType
                && e.ReferenceId == @event.SaleId, ct)
            .ConfigureAwait(false);
        var loyaltyAlreadyApplied = await dbContext.CustomerLoyaltyEntries
            .Where(e => e.SaleId == @event.SaleId
                && (e.EntryType == LoyaltyEntryType.Earn || e.EntryType == LoyaltyEntryType.Redeem))
            .Select(e => e.EntryType)
            .ToListAsync(ct)
            .ConfigureAwait(false);

        string saleLabel = $"Sale {@event.InvoiceNumber ?? @event.SaleId.ToString()}";

        // Skip what is already on the ledger: a redelivery, or Sales having posted it synchronously
        // through CustomerSalePostingService while the sale was created.
        if (onAccount)
        {
            onAccount = !saleAlreadyOnAccount && !await dbContext.CustomerLedgerEntries
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
                runningBalance: newBalance, referenceType: SaleReferenceType, referenceId: @event.SaleId, branchId: @event.BranchId,
                documentNumber: @event.InvoiceNumber));
        }

        if (redeemed && !loyaltyAlreadyApplied.Contains(LoyaltyEntryType.Redeem))
        {
            int balance = customer.ApplyLoyaltyPoints(-@event.LoyaltyPointsRedeemed, out int applied);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.Redeem, applied, balance, $"Redeemed on {saleLabel}", @event.SaleId, @event.BranchId));
        }

        // Members earn on what the sale came to after discounts (including any points redeemed).
        int earned = customer.IsMember ? loyalty.PointsEarnedOn(@event.TotalAmount) : 0;
        if (earned > 0 && !loyaltyAlreadyApplied.Contains(LoyaltyEntryType.Earn))
        {
            await EarnAsync(customer, @event, earned, saleLabel, ct).ConfigureAwait(false);
        }

        await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Earns <paramref name="earned"/> points on the sale, net of whatever was already reversed. This event can
    /// be handled after the sale's cancellation/return/refund (an outbox retry, or out-of-order delivery): those
    /// reversals found nothing to take back and left a 0-point marker carrying the share of the sale they
    /// reversed (<see cref="CustomerLoyaltyEntry.ReversedShare"/>). A cancelled sale earns nothing; a partly
    /// returned one earns in full and has the returned share taken straight back (a separate entry, so later
    /// reversals of the same sale — which work off the Earn total — keep adding up correctly).
    /// </summary>
    private async ValueTask EarnAsync(
        Customer customer, SaleCompletedIntegrationEvent @event, int earned, string saleLabel, CancellationToken ct)
    {
        Guid cancelEarnId = CustomerEntryIds.For(CancelKind + "-earn", @event.SaleId);
        Guid cancelRestoreId = CustomerEntryIds.For(CancelKind + "-restore", @event.SaleId);
        Guid cancelArId = CustomerEntryIds.For(CancelKind + "-ar", @event.SaleId);

        var reversals = await dbContext.CustomerLoyaltyEntries
            .AsNoTracking()
            .Where(e => e.SaleId == @event.SaleId && e.EntryType == LoyaltyEntryType.EarnReversed)
            .Select(e => new { e.Id, e.Points, e.ReversedShare })
            .ToListAsync(ct)
            .ConfigureAwait(false);

        // Cancellations reverse the whole sale. Older ones (before the share was recorded) are recognised by
        // their deterministic entry ids or their AR credit.
        bool cancelled = reversals.Exists(r => r.Id == cancelEarnId)
            || await dbContext.CustomerLoyaltyEntries.AnyAsync(e => e.Id == cancelRestoreId, ct).ConfigureAwait(false)
            || await dbContext.CustomerLedgerEntries
                .AnyAsync(e => e.Id == cancelArId || (e.ReferenceType == CancelReferenceType && e.ReferenceId == @event.SaleId), ct)
                .ConfigureAwait(false);
        if (cancelled)
        {
            return;
        }

        decimal share = reversals.Count == 0 ? 0m : reversals.Max(r => r.ReversedShare ?? 0m);
        if (share >= 1m)
        {
            return;
        }

        int balance = customer.ApplyLoyaltyPoints(earned, out int applied);
        dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
            customer.Id, LoyaltyEntryType.Earn, applied, balance, $"Earned on {saleLabel}", @event.SaleId, @event.BranchId));

        int alreadyReversed = -reversals.Sum(r => r.Points);
        int takeBack = CustomerSaleReversalService.Share(applied, alreadyReversed, share);
        if (takeBack > 0)
        {
            balance = customer.ApplyLoyaltyPoints(-takeBack, out int takenBack);
            dbContext.CustomerLoyaltyEntries.Add(CustomerLoyaltyEntry.Create(
                customer.Id, LoyaltyEntryType.EarnReversed, takenBack, balance,
                $"Earned points taken back: part of {saleLabel} was already returned/refunded",
                @event.SaleId, @event.BranchId, id: CustomerEntryIds.For("sale-earn-catchup", @event.SaleId), reversedShare: share));
        }
    }

    // Must match SaleCancelledIntegrationEventHandler's reversal kind / AR reference type.
    private const string CancelKind = SaleCancelledIntegrationEventHandler.Kind;
    private const string CancelReferenceType = SaleCancelledIntegrationEventHandler.ReferenceType;
}
