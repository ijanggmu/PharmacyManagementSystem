using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Prescriptions.IntegrationEventHandlers;

/// <summary>Medicine returned from a prescription sale was not taken, so its quantity goes back on the
/// prescription — and the refill slot too, once the whole dispensed quantity has come back.</summary>
public sealed class ReturnCompletedIntegrationEventHandler(PrescriptionsDbContext dbContext)
    : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var returned = @event.Lines.Select(l => (l.MedicineId, l.Quantity)).ToList();
        await PrescriptionDispenseReversal.ReverseAsync(
            dbContext, @event.SaleId, PrescriptionDispenseEntry.ReturnReference, @event.ReturnId, returned, ct)
            .ConfigureAwait(false);
    }
}
