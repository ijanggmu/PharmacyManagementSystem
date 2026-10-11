using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Inventory.Jobs;

/// <summary>
/// Daily: applies every scheduled medicine price change whose effective date (Nepal calendar) has
/// arrived — the port of the source's <c>apply_due_medicine_price_schedules</c> sweep. For each due
/// 'Scheduled' row: the medicine's current 'Active' row is superseded on the schedule's date, the
/// schedule becomes 'Active', the medicine takes its prices and its live lots are re-priced, so the
/// till charges the new price from that morning (<see cref="MedicinePriceApplier"/>).
///
/// Reads across tenants with <c>IgnoreQueryFilters()</c> and re-filters every related row by the
/// schedule's own tenant (its Finbuckle shadow property) — the same precedent as
/// <c>LicenseExpiryScanJob</c> (Reference) and <c>ProcessIrdInvoiceQueueJob</c> (Sales) for the
/// shared-database deployment. Each schedule is saved on its own, so one bad row does not hold back
/// the others.
/// </summary>
public sealed partial class ApplyDueMedicinePriceSchedulesJob(
    InventoryDbContext dbContext,
    ILogger<ApplyDueMedicinePriceSchedulesJob> logger)
{
    private const string TenantIdProperty = "TenantId";

    [AutomaticRetry(Attempts = 2)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var today = NepalClock.Today();

        var dueIds = await dbContext.MedicinePriceHistories.IgnoreQueryFilters().AsNoTracking()
            .Where(h => h.Status == MedicinePriceHistoryStatus.Scheduled && h.EffectiveFrom <= today)
            .OrderBy(h => h.EffectiveFrom)
            .ThenBy(h => h.CreatedAtUtc)
            .Select(h => new { h.Id, h.MedicineId })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int applied = 0;
        foreach (var due in dueIds)
        {
            try
            {
                if (await ApplyAsync(due.Id, cancellationToken).ConfigureAwait(false))
                {
                    applied++;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogScheduleFailed(logger, ex, due.Id, due.MedicineId);
            }
            finally
            {
                // Each schedule starts from database values; a failed one leaves nothing half-applied behind.
                dbContext.ChangeTracker.Clear();
            }
        }

        if (applied > 0)
        {
            LogApplied(logger, applied);
        }
    }

    private async Task<bool> ApplyAsync(Guid scheduleId, CancellationToken cancellationToken)
    {
        var schedule = await dbContext.MedicinePriceHistories.IgnoreQueryFilters()
            .FirstOrDefaultAsync(h => h.Id == scheduleId, cancellationToken)
            .ConfigureAwait(false);
        if (schedule is null || schedule.Status != MedicinePriceHistoryStatus.Scheduled)
        {
            return false;
        }

        string? tenantId = dbContext.Entry(schedule).Property(TenantIdProperty).CurrentValue as string;

        var medicine = await dbContext.Medicines.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                m => m.Id == schedule.MedicineId && EF.Property<string?>(m, TenantIdProperty) == tenantId,
                cancellationToken)
            .ConfigureAwait(false);
        if (medicine is null)
        {
            schedule.Cancel();
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return false;
        }

        var currentActive = await dbContext.MedicinePriceHistories.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                h => h.MedicineId == schedule.MedicineId && h.Status == MedicinePriceHistoryStatus.Active
                    && EF.Property<string?>(h, TenantIdProperty) == tenantId,
                cancellationToken)
            .ConfigureAwait(false);
        currentActive?.Supersede(schedule.EffectiveFrom);
        schedule.Activate();
        medicine.ChangePrices(schedule.UnitPrice, schedule.CostPrice);

        var liveBatches = await dbContext.MedicineBatches.IgnoreQueryFilters()
            .Where(b => b.MedicineId == schedule.MedicineId && !b.IsDisposed && b.QuantityOnHand > 0
                && EF.Property<string?>(b, TenantIdProperty) == tenantId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        foreach (var batch in liveBatches)
        {
            batch.ChangeSellingPrice(schedule.UnitPrice);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return true;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Applied {ScheduleCount} scheduled medicine price changes")]
    private static partial void LogApplied(ILogger logger, int scheduleCount);

    [LoggerMessage(Level = LogLevel.Error,
        Message = "Could not apply scheduled price change {ScheduleId} for medicine {MedicineId}")]
    private static partial void LogScheduleFailed(ILogger logger, Exception exception, Guid scheduleId, Guid medicineId);
}
