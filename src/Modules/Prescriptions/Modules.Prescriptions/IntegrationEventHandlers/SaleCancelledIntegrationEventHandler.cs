using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Prescriptions.IntegrationEventHandlers;

/// <summary>A cancelled sale gives back everything it dispensed against its prescription, refill slot
/// included, so the patient can be dispensed again.</summary>
public sealed class SaleCancelledIntegrationEventHandler(PrescriptionsDbContext dbContext)
    : IIntegrationEventHandler<SaleCancelledIntegrationEvent>
{
    public async Task HandleAsync(SaleCancelledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        await PrescriptionDispenseReversal.ReverseAsync(
            dbContext, @event.SaleId, PrescriptionDispenseEntry.SaleCancelReference, @event.SaleId, returned: null, ct)
            .ConfigureAwait(false);
    }
}
