using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Purchasing.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Voids the voucher posted for a direct goods receipt, if one exists — same pattern as
/// <see cref="SaleCancelledIntegrationEventHandler"/>: a void racing ahead of the original
/// <see cref="DirectGoodsReceiptPostedIntegrationEvent"/>'s delivery is a safe no-op here.</summary>
public sealed class DirectGoodsReceiptVoidedIntegrationEventHandler(IVoucherPostingService voucherPostingService)
    : IIntegrationEventHandler<DirectGoodsReceiptVoidedIntegrationEvent>
{
    public async Task HandleAsync(DirectGoodsReceiptVoidedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var voucherId = await voucherPostingService.FindPostedVoucherIdAsync("DirectGoodsReceipt", @event.ReceiptId, ct).ConfigureAwait(false);
        if (voucherId is { } id)
        {
            await voucherPostingService.VoidAsync(id, $"Direct goods receipt {@event.ReceiptId} voided: {@event.Reason}", ct).ConfigureAwait(false);
        }
    }
}
