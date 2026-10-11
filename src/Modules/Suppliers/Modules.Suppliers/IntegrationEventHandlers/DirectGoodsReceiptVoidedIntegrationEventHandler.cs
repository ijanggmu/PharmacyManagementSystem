using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Purchasing.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Services;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>Credits back the AP ledger for a voided direct goods receipt — the stock side of the
/// reversal already happened synchronously in Purchasing before this event was raised (see
/// <c>VoidDirectGoodsReceiptCommandHandler</c>).</summary>
public sealed class DirectGoodsReceiptVoidedIntegrationEventHandler(ISupplierLedgerService supplierLedgerService)
    : IIntegrationEventHandler<DirectGoodsReceiptVoidedIntegrationEvent>
{
    public async Task HandleAsync(DirectGoodsReceiptVoidedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.GrossAmount <= 0)
        {
            return;
        }

        await supplierLedgerService.RecordReturnAsync(
            @event.SupplierId, @event.GrossAmount, @event.ReceiptDateUtc,
            $"Void of {@event.ReceiptNumber ?? $"direct goods receipt {@event.ReceiptId}"}: {@event.Reason}",
            "DirectGoodsReceiptVoid", @event.ReceiptId, @event.BranchId, ct)
            .ConfigureAwait(false);
    }
}
