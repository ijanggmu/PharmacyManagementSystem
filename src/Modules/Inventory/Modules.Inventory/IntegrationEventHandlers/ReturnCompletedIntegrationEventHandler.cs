using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Inventory.IntegrationEventHandlers;

/// <summary>Puts a completed customer return's stock back on the shelf at the return's branch, into the
/// lots the original sale drew from — same surface as <see cref="SaleCancelledIntegrationEventHandler"/>,
/// with <c>ReferenceType</c> "Return".</summary>
public sealed class ReturnCompletedIntegrationEventHandler(IStockDeductionService stockDeductionService)
    : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        await stockDeductionService.RestockAsync(
            new StockRestockRequest(
                ReferenceType: "Return",
                ReferenceId: @event.ReturnId,
                OriginalReferenceType: "Sale",
                OriginalReferenceId: @event.SaleId,
                BranchId: @event.BranchId == Guid.Empty ? null : @event.BranchId,
                Lines: @event.Lines.Select(l => new StockRestockLine(l.MedicineId, l.Quantity, l.UnitCostPrice)).ToList(),
                Notes: "Restocked from customer return"),
            ct).ConfigureAwait(false);
    }
}
