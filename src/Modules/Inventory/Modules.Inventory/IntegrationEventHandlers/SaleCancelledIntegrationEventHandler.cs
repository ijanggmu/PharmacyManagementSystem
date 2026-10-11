using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Inventory.IntegrationEventHandlers;

/// <summary>Puts a cancelled sale's stock back into the lots the sale drew from, at the sale's branch
/// (the event's <c>BranchId</c>; for older events without one, the branch of the sale's own stock
/// deduction). See <see cref="IStockDeductionService.RestockAsync"/>.</summary>
public sealed class SaleCancelledIntegrationEventHandler(IStockDeductionService stockDeductionService)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        await stockDeductionService.RestockAsync(
            new StockRestockRequest(
                ReferenceType: "Sale",
                ReferenceId: @event.SaleId,
                OriginalReferenceType: "Sale",
                OriginalReferenceId: @event.SaleId,
                BranchId: @event.BranchId,
                Lines: @event.Lines.Select(l => new StockRestockLine(l.MedicineId, l.Quantity, l.UnitCostPrice)).ToList(),
                Notes: "Restocked from sale cancellation"),
            ct).ConfigureAwait(false);
    }
}
