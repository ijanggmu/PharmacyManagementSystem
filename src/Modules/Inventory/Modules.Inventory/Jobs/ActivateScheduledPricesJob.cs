using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Inventory.Jobs;

/// <summary>
/// Hourly: applies every scheduled medicine price whose effective date (a Nepal calendar day) has
/// arrived — the medicine takes the new price, the previous active price row is superseded, and the
/// batches still at the old price move with it (<see cref="BatchSellingPrices"/>). Without this a
/// future-dated price change was recorded but never took effect.
///
/// Reads across tenants with <c>IgnoreQueryFilters()</c>, re-filtered by the schedule's own medicine id,
/// the same precedent as <c>LicenseExpiryScanJob</c> (Reference) for the shared-database deployment.
/// </summary>
public sealed class ActivateScheduledPricesJob(
    InventoryDbContext dbContext,
    ILogger<ActivateScheduledPricesJob> logger)
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    /// <summary>The calendar day in Nepal at <paramref name="utcNow"/>.</summary>
    public static DateOnly NepalToday(DateTime utcNow) => DateOnly.FromDateTime(utcNow + NepalOffset);

    [AutomaticRetry(Attempts = 2)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var today = NepalToday(DateTime.UtcNow);

        var due = await dbContext.MedicinePriceHistories.IgnoreQueryFilters()
            .Where(h => h.Status == MedicinePriceHistoryStatus.Scheduled && h.EffectiveFrom <= today)
            .OrderBy(h => h.EffectiveFrom)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int applied = 0;
        foreach (var schedule in due)
        {
            var medicine = await dbContext.Medicines.IgnoreQueryFilters()
                .FirstOrDefaultAsync(m => m.Id == schedule.MedicineId, cancellationToken)
                .ConfigureAwait(false);
            if (medicine is null)
            {
                schedule.Cancel();
                continue;
            }

            var currentActive = await dbContext.MedicinePriceHistories.IgnoreQueryFilters()
                .FirstOrDefaultAsync(
                    h => h.MedicineId == schedule.MedicineId && h.Status == MedicinePriceHistoryStatus.Active,
                    cancellationToken)
                .ConfigureAwait(false);
            currentActive?.Supersede(schedule.EffectiveFrom);

            decimal previousPrice = medicine.UnitPrice;
            medicine.ChangePrices(schedule.UnitPrice, schedule.CostPrice);
            schedule.Activate();
            await BatchSellingPrices.FollowMedicinePriceAsync(
                dbContext, medicine.Id, previousPrice, medicine.UnitPrice, cancellationToken).ConfigureAwait(false);

            // One medicine at a time, so a second schedule of the same medicine sees this one as the active row.
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            applied++;
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (applied > 0 && logger.IsEnabled(LogLevel.Information))
        {
            logger.LogInformation("Applied {PriceChangeCount} scheduled medicine price changes", applied);
        }
    }
}
