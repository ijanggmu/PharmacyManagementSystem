using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Sales.Contracts.Events;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>
/// A cancelled sale's effect on the customer: the balance it left on account is credited back, the loyalty
/// points it earned are taken back and the points redeemed on it are given back — all of it, since a
/// cancellation reverses the whole sale (Sales refuses to cancel a sale that already has returns/refunds).
/// Idempotent: see <see cref="CustomerSaleReversalService"/>.
/// <para>Events queued before the customer fields existed carry no
/// <see cref="SaleCancelledIntegrationEvent.CustomerId"/> / <see cref="SaleCancelledIntegrationEvent.OnAccountAmount"/>.
/// For those the customer and the amount are recovered from what the sale left in this module: its AR ledger
/// entry (ReferenceType "Sale", ReferenceId = the sale) or, for a sale paid in full, its loyalty entries. A sale
/// with no trace here never touched a customer account, and is skipped.</para>
/// </summary>
public sealed class SaleCancelledIntegrationEventHandler(CustomersDbContext dbContext)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    /// <summary>Reversal kind — part of the deterministic entry ids (see <see cref="CustomerEntryIds"/>).</summary>
    public const string Kind = "sale-cancel";

    /// <summary>The AR ledger reference type of a cancellation credit.</summary>
    public const string ReferenceType = "SaleCancellation";

    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        Guid customerId;
        decimal onAccount = Math.Max(0m, @event.OnAccountAmount);

        if (@event.CustomerId is { } eventCustomerId)
        {
            customerId = eventCustomerId;
        }
        else
        {
            var recovered = await RecoverFromLedgerAsync(@event.SaleId, ct).ConfigureAwait(false);
            if (recovered is null)
            {
                return;
            }

            (customerId, onAccount) = recovered.Value;
        }

        string saleLabel = $"Sale {@event.InvoiceNumber ?? @event.SaleId.ToString()} cancelled";
        await CustomerSaleReversalService.ApplyAsync(
            dbContext,
            new CustomerSaleReversal(
                Kind: Kind,
                ReferenceType: ReferenceType,
                ReferenceId: @event.SaleId,
                CustomerId: customerId,
                SaleId: @event.SaleId,
                BranchId: @event.BranchId,
                OnAccountCredit: onAccount,
                LoyaltyShare: 1m,
                Label: saleLabel,
                DocumentNumber: @event.InvoiceNumber),
            ct).ConfigureAwait(false);
    }

    /// <summary>The sale's customer and what it put on account, from the sale's own entries in this module
    /// (an old event without those fields). Null when the sale never touched a customer's account.</summary>
    internal async Task<(Guid CustomerId, decimal OnAccount)?> RecoverFromLedgerAsync(Guid saleId, CancellationToken ct)
    {
        var saleEntries = await dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.ReferenceType == CustomerSalePostingService.SaleReferenceType
                && e.ReferenceId == saleId
                && e.EntryType == CustomerLedgerEntryType.Sale)
            .Select(e => new { e.CustomerId, e.DebitAmount })
            .ToListAsync(ct)
            .ConfigureAwait(false);
        if (saleEntries.Count > 0)
        {
            return (saleEntries[0].CustomerId, saleEntries.Sum(e => e.DebitAmount));
        }

        Guid? loyaltyCustomerId = await dbContext.CustomerLoyaltyEntries
            .AsNoTracking()
            .Where(e => e.SaleId == saleId
                && (e.EntryType == LoyaltyEntryType.Earn || e.EntryType == LoyaltyEntryType.Redeem))
            .Select(e => (Guid?)e.CustomerId)
            .FirstOrDefaultAsync(ct)
            .ConfigureAwait(false);

        return loyaltyCustomerId is { } id ? (id, 0m) : null;
    }
}
