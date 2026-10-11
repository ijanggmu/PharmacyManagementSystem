using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Prescriptions.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Prescriptions.IntegrationEventHandlers;

/// <summary>
/// Reconciles a completed sale's dispense against its prescription. The sale now consumes the prescription
/// synchronously, inside its own transaction (<see cref="IDispensingSafetyPolicy.ConsumeForSaleAsync"/>), so
/// for those sales this is a no-op. It still records sales completed before that existed, and it never
/// throws for an already-recorded or no-longer-fitting dispense (see
/// <see cref="DispensingSafetyPolicy.ReconcileSaleDispenseAsync"/>). A no-op when
/// <see cref="SaleCompletedIntegrationEvent.PrescriptionId"/> is null.
/// </summary>
public sealed class SaleCompletedIntegrationEventHandler(DispensingSafetyPolicy dispensingSafetyPolicy)
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
        await dispensingSafetyPolicy.ReconcileSaleDispenseAsync(@event.SaleId, prescriptionId, lines, ct).ConfigureAwait(false);
    }
}
