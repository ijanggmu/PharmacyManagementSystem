using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Inventory.IntegrationEventHandlers;

/// <summary>Puts the returned units back on the shelf at the return's branch, into the batch each was
/// sold from (see <see cref="IStockDeductionService.RestockFromCancellationAsync"/>). Opened or damaged
/// packs (<c>Restock</c> false) are not restocked.</summary>
public sealed class ReturnCompletedIntegrationEventHandler(IStockDeductionService stockDeductionService)
    : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var reconstructed = @event.Lines
            .Where(l => l.Restock)
            .Select(l => new StockDeductionLineResult(
                l.MedicineId, l.Quantity,
                [new BatchDeductionDetail(l.BatchId ?? Guid.Empty, "N/A", l.Quantity, l.UnitCostPrice)]))
            .ToList();
        if (reconstructed.Count == 0)
        {
            return;
        }

        await stockDeductionService.RestockFromCancellationAsync("Return", @event.ReturnId, @event.BranchId, reconstructed, ct)
            .ConfigureAwait(false);
    }
}
