using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

/// <summary>
/// Ported from DELETE app/api/medicines/[id]/price-history/[historyId]/route.ts +
/// `cancelScheduledMedicinePrice`, backed by `cancel_scheduled_medicine_price`: only a
/// still-pending 'Scheduled' row can be cancelled; anything else (already active/superseded/
/// cancelled, or belonging to a different medicine) raises the same "no pending scheduled price
/// change found" error the SQL function raises.
/// </summary>
public sealed class CancelMedicinePriceScheduleCommandHandler(InventoryDbContext dbContext)
    : ICommandHandler<CancelMedicinePriceScheduleCommand, Unit>
{
    public async ValueTask<Unit> Handle(CancelMedicinePriceScheduleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var history = await dbContext.MedicinePriceHistories
            .FirstOrDefaultAsync(
                h => h.Id == command.HistoryId
                     && h.MedicineId == command.MedicineId
                     && h.Status == MedicinePriceHistoryStatus.Scheduled,
                cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("No pending scheduled price change found with that id.");

        history.Cancel();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}
