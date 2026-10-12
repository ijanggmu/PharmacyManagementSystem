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
/// backed by the source's `schedule_medicine_price` SQL function.
///
/// Immediate (<c>EffectiveFrom</c> == today): supersedes the current 'Active' row (if any),
/// inserts a new 'Active' row and applies the prices to the <see cref="Medicine"/> — mirroring the
/// SQL function's <c>p_effective_from = CURRENT_DATE</c> branch, which also writes
/// <c>medicines.unit_price/cost_price</c>.
///
/// Future-dated: cancels any still-pending 'Scheduled' row for the medicine and inserts a new
/// 'Scheduled' row — mirroring the SQL function's future branch.
///
/// Not ported: the source's automatic trigger-based capture on every direct
/// medicines.unit_price/cost_price edit, and the opportunistic
/// `apply_due_medicine_price_schedules` sweep that promotes a due 'Scheduled' row to 'Active' —
/// both depend on a Medicine-level price column this port doesn't have. A future slice that
/// adds pricing to <see cref="Medicine"/> would need a small sweep command/job to promote due
/// schedules; out of scope here.
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

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (command.EffectiveFrom < today)
        {
            throw new CustomException(
                "Effective date cannot be in the past.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (command.EffectiveFrom == today)
        {
            decimal previousUnitPrice = medicine.UnitPrice;
            medicine.ChangePrices(command.UnitPrice, command.CostPrice);
            await BatchSellingPrices.FollowMedicinePriceAsync(
                dbContext, medicine.Id, previousUnitPrice, medicine.UnitPrice, cancellationToken).ConfigureAwait(false);
            var active = await MedicinePriceHistoryRecorder.RecordActiveAsync(
                dbContext, medicine.Id, command.UnitPrice, command.CostPrice, command.Reason, cancellationToken)
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
