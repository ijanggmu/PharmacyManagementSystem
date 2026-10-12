using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Purchasing.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Reverses the voucher posted for a direct goods receipt, if one exists, dated at the void
/// (moved to the first open day if that falls in a locked period) — same pattern as
/// <see cref="SaleCancelledIntegrationEventHandler"/>: a void racing ahead of the original
/// <see cref="DirectGoodsReceiptPostedIntegrationEvent"/>'s delivery records a "reversed before posted" marker,
/// so the late receipt voucher is posted and reversed at once.</summary>
public sealed class DirectGoodsReceiptVoidedIntegrationEventHandler(IVoucherPostingService voucherPostingService)
    : IIntegrationEventHandler<DirectGoodsReceiptVoidedIntegrationEvent>
{
    public async Task HandleAsync(DirectGoodsReceiptVoidedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        await voucherPostingService.ReverseSystemVoucherAsync(
            "DirectGoodsReceipt", @event.ReceiptId,
            $"Direct goods receipt {@event.ReceiptNumber ?? @event.ReceiptId.ToString()} voided: {@event.Reason}",
            @event.OccurredOnUtc, ct).ConfigureAwait(false);
    }
}
