using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Services;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>Posts the AP ledger entry for a consignment settlement — same effect as receiving a
/// purchase order (the pharmacy now owes the supplier for stock it's holding).</summary>
public sealed class ConsignmentSettledIntegrationEventHandler(ISupplierLedgerService supplierLedgerService)
    : IIntegrationEventHandler<ConsignmentSettledIntegrationEvent>
{
    public async Task HandleAsync(ConsignmentSettledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        await supplierLedgerService.RecordPurchaseAsync(
            @event.SupplierId, @event.TotalAmount, @event.SettlementDateUtc,
            $"Consignment settlement {@event.SettlementId}", "ConsignmentSettlement", @event.SettlementId, @event.BranchId, ct).ConfigureAwait(false);
    }
}
