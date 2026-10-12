using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Inventory.IntegrationEventHandlers;

/// <summary>Puts a cancelled sale's units back into the batches they were sold from (see
/// <see cref="IStockDeductionService.RestockFromCancellationAsync"/>), at the sale's branch. Events
/// raised before the event carried the branch fall back to the current branch.</summary>
public sealed class SaleCancelledIntegrationEventHandler(IStockDeductionService stockDeductionService, ICurrentBranch currentBranch)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var reconstructed = @event.Lines
            .Select(l => new StockDeductionLineResult(
                l.MedicineId, l.Quantity,
                [new BatchDeductionDetail(l.BatchId ?? Guid.Empty, "N/A", l.Quantity, l.UnitCostPrice)]))
            .ToList();

        Guid branchId = @event.BranchId
            ?? await currentBranch.RequireBranchIdAsync(ct).ConfigureAwait(false);

        await stockDeductionService.RestockFromCancellationAsync("Sale", @event.SaleId, branchId, reconstructed, ct)
            .ConfigureAwait(false);
    }
}
