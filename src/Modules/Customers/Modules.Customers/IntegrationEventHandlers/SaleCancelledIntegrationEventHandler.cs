using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>
/// A cancelled sale's effect on the customer: the balance it left on account is credited back, the loyalty
/// points it earned are taken back and the points redeemed on it are given back — all of it, since a
/// cancellation reverses the whole sale (Sales refuses to cancel a sale that already has returns/refunds).
/// Idempotent: see <see cref="CustomerSaleReversalService"/>. Events queued before the customer fields
/// existed carry no <see cref="SaleCancelledIntegrationEvent.CustomerId"/> and are skipped.
/// </summary>
public sealed class SaleCancelledIntegrationEventHandler(CustomersDbContext dbContext)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.CustomerId is not { } customerId)
        {
            return;
        }

        string saleLabel = $"Sale {@event.InvoiceNumber ?? @event.SaleId.ToString()} cancelled";
        await CustomerSaleReversalService.ApplyAsync(
            dbContext,
            new CustomerSaleReversal(
                Kind: "sale-cancel",
                ReferenceType: "SaleCancellation",
                ReferenceId: @event.SaleId,
                CustomerId: customerId,
                SaleId: @event.SaleId,
                BranchId: @event.BranchId,
                OnAccountCredit: Math.Max(0m, @event.OnAccountAmount),
                LoyaltyShare: 1m,
                Label: saleLabel,
                DocumentNumber: @event.InvoiceNumber),
            ct).ConfigureAwait(false);
    }
}
