using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Suppliers.Contracts.Events;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Reverses the voucher posted for a supplier payment (<see cref="SupplierPaymentRecordedIntegrationEventHandler"/>,
/// reference <c>SupplierPayment</c> / the payment's ledger entry id) with a reversing voucher dated at the void,
/// moved to the first open day when that falls in a locked period — the same system reversal path as
/// <see cref="DirectGoodsReceiptVoidedIntegrationEventHandler"/>. A void racing ahead of the payment's own delivery
/// records a "reversed before posted" marker, so the late payment voucher is posted and reversed at once; a
/// redelivery is a no-op.</summary>
public sealed class SupplierPaymentVoidedIntegrationEventHandler(IVoucherPostingService voucherPostingService)
    : IIntegrationEventHandler<SupplierPaymentVoidedIntegrationEvent>
{
    public async Task HandleAsync(SupplierPaymentVoidedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        await voucherPostingService.ReverseSystemVoucherAsync(
            "SupplierPayment", @event.LedgerEntryId,
            $"Payment to supplier '{@event.SupplierName}' voided: {@event.Reason}",
            @event.VoidedAtUtc, ct).ConfigureAwait(false);
    }
}
