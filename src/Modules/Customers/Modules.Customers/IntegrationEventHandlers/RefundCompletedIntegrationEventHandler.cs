using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>
/// A completed refund's effect on the customer — same as a return
/// (<see cref="ReturnCompletedIntegrationEventHandler"/>): AR credit for the on-account part of the refund,
/// loyalty reversed pro rata of what has been returned/refunded of the sale so far. Idempotent: see
/// <see cref="CustomerSaleReversalService"/>.
/// </summary>
public sealed class RefundCompletedIntegrationEventHandler(CustomersDbContext dbContext)
    : IIntegrationEventHandler<RefundCompletedIntegrationEvent>
{
    public async Task HandleAsync(RefundCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.CustomerId is not { } customerId)
        {
            return;
        }

        await CustomerSaleReversalService.ApplyAsync(
            dbContext,
            new CustomerSaleReversal(
                Kind: "sale-refund",
                ReferenceType: "SaleRefund",
                ReferenceId: @event.RefundId,
                CustomerId: customerId,
                SaleId: @event.OriginalSaleId,
                BranchId: @event.BranchId,
                OnAccountCredit: Math.Max(0m, @event.OnAccountAmount),
                LoyaltyShare: ReturnCompletedIntegrationEventHandler.CumulativeShare(
                    @event.ReversedToDateAmount, @event.ItemsAmount, @event.SaleTotalAmount),
                Label: $"Refund {@event.CreditNoteNumber ?? @event.RefundId.ToString()}",
                DocumentNumber: @event.CreditNoteNumber),
            ct).ConfigureAwait(false);
    }
}
