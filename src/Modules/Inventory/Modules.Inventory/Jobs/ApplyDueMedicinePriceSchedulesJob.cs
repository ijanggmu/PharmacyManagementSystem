using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Inventory.Jobs;

/// <summary>
/// Daily: applies every scheduled medicine price change whose effective date (Nepal calendar) has
/// arrived — the port of the source's <c>apply_due_medicine_price_schedules</c> sweep. For each due
/// 'Scheduled' row: the medicine's current 'Active' row is superseded on the schedule's date, the
/// schedule becomes 'Active', the medicine takes its prices and its lots are re-priced, so the till
/// charges the new price from that morning (<see cref="MedicinePriceApplier"/>).
///
/// Hangfire runs this with no HTTP request and so no Finbuckle tenant. Writing a multi-tenant entity
/// without one fails ("MultiTenant Entity cannot be changed if TenantInfo is null"), and a context bound
/// to one tenant refuses another tenant's rows ("Tenant Id mismatch"). So the job walks the tenant store
/// and, per tenant, opens a fresh DI scope, installs that tenant with <see cref="IMultiTenantContextSetter"/>
/// and only then resolves the <see cref="InventoryDbContext"/> — the WebhookDispatchJob/SqlAuditSink
/// pattern. Every query then runs through the normal tenant filter (and the tenant's own database when it
/// has one). Each schedule is saved on its own, so one bad row does not hold back the others, and one
/// tenant's failure does not hold back the next tenant.
/// </summary>
public sealed partial class ApplyDueMedicinePriceSchedulesJob(
    IServiceScopeFactory scopeFactory,
    IMultiTenantStore<AppTenantInfo> tenantStore,
    ILogger<ApplyDueMedicinePriceSchedulesJob> logger)
{
    [AutomaticRetry(Attempts = 2)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var tenants = await tenantStore.GetAllAsync().ConfigureAwait(false);

        int applied = 0;
        foreach (var tenant in tenants)
        {
            // An inactive tenant's due schedules wait: their date has passed, so the first run after the
            // tenant is reactivated applies them.
            if (!tenant.IsActive)
            {
                continue;
            }

            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                applied += await ApplyForTenantAsync(tenant, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogTenantFailed(logger, ex, tenant.Id);
            }
        }

        if (applied > 0)
        {
            LogApplied(logger, applied);
        }
    }

    private async Task<int> ApplyForTenantAsync(AppTenantInfo tenant, CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var dbContext = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        return await ApplyDueForCurrentTenantAsync(dbContext, NepalClock.Today(), logger, cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>
    /// Applies the due schedules visible to <paramref name="dbContext"/> — a context already bound to one
    /// tenant. Returns how many were applied.
    /// </summary>
    public static async Task<int> ApplyDueForCurrentTenantAsync(
        InventoryDbContext dbContext, DateOnly today, ILogger logger, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(logger);

        var dueIds = await dbContext.MedicinePriceHistories.AsNoTracking()
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
                if (await ApplyAsync(dbContext, due.Id, cancellationToken).ConfigureAwait(false))
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

        return applied;
    }

    private static async Task<bool> ApplyAsync(InventoryDbContext dbContext, Guid scheduleId, CancellationToken cancellationToken)
    {
        var schedule = await dbContext.MedicinePriceHistories
            .FirstOrDefaultAsync(h => h.Id == scheduleId, cancellationToken)
            .ConfigureAwait(false);
        if (schedule is null || schedule.Status != MedicinePriceHistoryStatus.Scheduled)
        {
            return false;
        }

        var medicine = await dbContext.Medicines
            .FirstOrDefaultAsync(m => m.Id == schedule.MedicineId, cancellationToken)
            .ConfigureAwait(false);
        if (medicine is null)
        {
            schedule.Cancel();
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return false;
        }

        var currentActive = await dbContext.MedicinePriceHistories
            .FirstOrDefaultAsync(
                h => h.MedicineId == schedule.MedicineId && h.Status == MedicinePriceHistoryStatus.Active,
                cancellationToken)
            .ConfigureAwait(false);
        currentActive?.Supersede(schedule.EffectiveFrom);
        schedule.Activate();
        decimal previousUnitPrice = medicine.UnitPrice;
        medicine.ChangePrices(schedule.UnitPrice, schedule.CostPrice);

        await MedicinePriceApplier.RepriceLiveBatchesAsync(dbContext, schedule.MedicineId, previousUnitPrice, schedule.UnitPrice, cancellationToken)
            .ConfigureAwait(false);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return true;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Applied {ScheduleCount} scheduled medicine price changes")]
    private static partial void LogApplied(ILogger logger, int scheduleCount);

    [LoggerMessage(Level = LogLevel.Error,
        Message = "Could not apply scheduled price changes for tenant {TenantId}")]
    private static partial void LogTenantFailed(ILogger logger, Exception exception, string? tenantId);

    [LoggerMessage(Level = LogLevel.Error,
        Message = "Could not apply scheduled price change {ScheduleId} for medicine {MedicineId}")]
    private static partial void LogScheduleFailed(ILogger logger, Exception exception, Guid scheduleId, Guid medicineId);
}
