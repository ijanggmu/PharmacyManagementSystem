using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Inventory.IntegrationEventHandlers;

/// <summary>Restocks the medicines from a cancelled sale into a new batch dated today — not the
/// original batches, since they may have moved on since the sale (root plan §12's "not a raw undo"
/// note).</summary>
public sealed class SaleCancelledIntegrationEventHandler(IStockDeductionService stockDeductionService)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var reconstructed = @event.Lines
            .Select(l => new StockDeductionLineResult(
                l.MedicineId, l.Quantity,
                [new BatchDeductionDetail(Guid.Empty, "N/A", l.Quantity, l.UnitCostPrice)]))
            .ToList();

        await stockDeductionService.RestockFromCancellationAsync("Sale", @event.SaleId, reconstructed, ct).ConfigureAwait(false);
    }
}
