using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Prescriptions.IntegrationEventHandlers;

/// <summary>A cancelled sale gives back everything it dispensed against a prescription (quantity and fill).
/// Idempotent, see <see cref="SaleDispenseReversalService"/>.</summary>
public sealed class SaleCancelledIntegrationEventHandler(SaleDispenseReversalService reversals)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        // The cancelled sale's own id is the source document: a sale is cancelled at most once.
        await reversals.ReverseAsync(@event.SaleId, DispenseReversalSource.SaleCancelled, @event.SaleId, lines: null, ct)
            .ConfigureAwait(false);
    }
}
