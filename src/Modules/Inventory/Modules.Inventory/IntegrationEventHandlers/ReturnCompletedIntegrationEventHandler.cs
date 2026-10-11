using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Inventory.IntegrationEventHandlers;

/// <summary>Restocks the medicines from a completed customer return into a new batch dated today —
/// same "not a raw undo" reasoning as <see cref="SaleCancelledIntegrationEventHandler"/> (root plan
/// §12), reusing the same <see cref="IStockDeductionService.RestockFromCancellationAsync"/> surface
/// with <c>ReferenceType</c> "Return" instead of "Sale".</summary>
public sealed class ReturnCompletedIntegrationEventHandler(IStockDeductionService stockDeductionService)
    : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var reconstructed = @event.Lines
            .Select(l => new StockDeductionLineResult(
                l.MedicineId, l.Quantity,
                [new BatchDeductionDetail(Guid.Empty, "N/A", l.Quantity, l.UnitCostPrice)]))
            .ToList();

        await stockDeductionService.RestockFromCancellationAsync("Return", @event.ReturnId, reconstructed, ct).ConfigureAwait(false);
    }
}
