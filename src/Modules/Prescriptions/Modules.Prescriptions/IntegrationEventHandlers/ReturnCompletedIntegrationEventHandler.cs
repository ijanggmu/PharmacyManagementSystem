using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Prescriptions.Domain;
using FSH.Modules.Prescriptions.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Prescriptions.IntegrationEventHandlers;

/// <summary>Returned medicine gives its quantity back to the prescription the sale dispensed it against
/// (the fill only once the sale's whole dispense of it is returned). Idempotent per return, see
/// <see cref="SaleDispenseReversalService"/>.</summary>
public sealed class ReturnCompletedIntegrationEventHandler(SaleDispenseReversalService reversals)
    : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        var lines = @event.Lines.Select(l => new DispenseReversalLine(l.MedicineId, l.Quantity)).ToList();
        await reversals.ReverseAsync(@event.SaleId, DispenseReversalSource.SaleReturn, @event.ReturnId, lines, ct)
            .ConfigureAwait(false);
    }
}
