using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

/// <summary>
/// Ported from POST app/api/medicines/[id]/price-history/route.ts + `scheduleMedicinePriceChange`,
/// backed by the source's `schedule_medicine_price` SQL function. "Today" is the Nepal calendar date
/// (<see cref="NepalClock"/>).
///
/// Immediate (<c>EffectiveFrom</c> == today): supersedes the current 'Active' row (if any),
/// inserts a new 'Active' row, applies the prices to the <see cref="Medicine"/> and re-prices its live
/// lots so the till charges the new price (<see cref="MedicinePriceApplier"/>).
///
/// Future-dated: cancels any still-pending 'Scheduled' row for the medicine and inserts a new
/// 'Scheduled' row. <see cref="Jobs.ApplyDueMedicinePriceSchedulesJob"/> applies it on its date.
/// </summary>
public sealed class CreateMedicinePriceScheduleCommandHandler(InventoryDbContext dbContext)
    : ICommandHandler<CreateMedicinePriceScheduleCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateMedicinePriceScheduleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var medicine = await dbContext.Medicines
            .FirstOrDefaultAsync(m => m.Id == command.MedicineId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {command.MedicineId} not found.");

        var today = NepalClock.Today();
        if (command.EffectiveFrom < today)
        {
            throw new CustomException(
                "Effective date cannot be in the past.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (command.EffectiveFrom == today)
        {
            var active = await MedicinePriceApplier.ApplyNowAsync(
                dbContext, medicine, command.UnitPrice, command.CostPrice, command.Reason, cancellationToken)
                .ConfigureAwait(false);

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return active.Id;
        }

        var pendingSchedule = await dbContext.MedicinePriceHistories
            .FirstOrDefaultAsync(
                h => h.MedicineId == command.MedicineId && h.Status == MedicinePriceHistoryStatus.Scheduled,
                cancellationToken)
            .ConfigureAwait(false);
        pendingSchedule?.Cancel();

        var scheduled = MedicinePriceHistory.CreateScheduled(
            command.MedicineId, command.UnitPrice, command.CostPrice, command.EffectiveFrom, command.Reason);
        dbContext.MedicinePriceHistories.Add(scheduled);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return scheduled.Id;
    }
}
