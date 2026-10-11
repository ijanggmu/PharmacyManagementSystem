using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Prescriptions.IntegrationEventHandlers;

/// <summary>Records the dispensed quantity/refill against the prescription used on a completed sale,
/// when one was used. A no-op when <see cref="SaleCompletedIntegrationEvent.PrescriptionId"/> is
/// null.</summary>
public sealed class SaleCompletedIntegrationEventHandler(IDispensingSafetyPolicy dispensingSafetyPolicy)
    : IIntegrationEventHandler<SaleCompletedIntegrationEvent>
{
    public async Task HandleAsync(SaleCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.PrescriptionId is not { } prescriptionId)
        {
            return;
        }

        var lines = @event.Lines.Select(l => new DispenseCheckLine(l.MedicineId, l.Quantity)).ToList();
        await dispensingSafetyPolicy.RecordDispenseAsync(prescriptionId, lines, ct).ConfigureAwait(false);
    }
}
