using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Voids the voucher posted for a sale, if one exists. A cancellation racing ahead of the
/// original <see cref="SaleCompletedIntegrationEvent"/>'s delivery is a safe no-op here — the
/// reconciliation reports (pharmacy-modules-plan.md §4.3) are what catches a sale left without a
/// voucher to void.</summary>
public sealed class SaleCancelledIntegrationEventHandler(IVoucherPostingService voucherPostingService)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var voucherId = await voucherPostingService.FindPostedVoucherIdAsync("Sale", @event.SaleId, ct).ConfigureAwait(false);
        if (voucherId is { } id)
        {
            await voucherPostingService.VoidAsync(id, $"Sale {@event.SaleId} cancelled: {@event.Reason}", ct).ConfigureAwait(false);
        }
    }
}
