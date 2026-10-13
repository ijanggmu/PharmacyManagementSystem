using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.Services;

namespace FSH.Modules.Suppliers.IntegrationEventHandlers;

/// <summary>Posts the AP ledger entry for a consignment settlement — same effect as receiving a
/// purchase order (the pharmacy now owes the supplier for stock it's holding). The supplier is owed the
/// gross bill — the net cost plus the VAT it charges — matching Accounting's Cr Accounts Payable.</summary>
public sealed class ConsignmentSettledIntegrationEventHandler(ISupplierLedgerService supplierLedgerService)
    : IIntegrationEventHandler<ConsignmentSettledIntegrationEvent>
{
    public async Task HandleAsync(ConsignmentSettledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        // A settlement owing nothing (units consigned at no cost) has no bill to post.
        decimal payable = @event.TotalAmount + @event.VatAmount;
        if (payable <= 0)
        {
            return;
        }

        await supplierLedgerService.RecordPurchaseAsync(
            @event.SupplierId, payable, @event.SettlementDateUtc,
            $"Consignment settlement {@event.SettlementId}", "ConsignmentSettlement", @event.SettlementId, @event.BranchId, ct).ConfigureAwait(false);
    }
}
