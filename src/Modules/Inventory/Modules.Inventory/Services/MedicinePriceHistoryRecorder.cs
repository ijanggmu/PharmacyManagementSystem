using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Keeps <see cref="MedicinePriceHistory"/> in step with the medicine's current prices: the
/// current 'Active' row is superseded today and a new 'Active' row records the new prices, so the
/// price history shows every change, whether made on the medicine form or as a price schedule.
/// Returns the new row; the caller saves.
/// </summary>
public static class MedicinePriceHistoryRecorder
{
    public static async Task<MedicinePriceHistory> RecordActiveAsync(
        InventoryDbContext dbContext, Guid medicineId, decimal unitPrice, decimal? costPrice, string? reason,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var currentActive = await dbContext.MedicinePriceHistories
            .FirstOrDefaultAsync(
                h => h.MedicineId == medicineId && h.Status == MedicinePriceHistoryStatus.Active,
                cancellationToken)
            .ConfigureAwait(false);
        currentActive?.Supersede(today);

        var active = MedicinePriceHistory.CreateActive(medicineId, unitPrice, costPrice, today, reason);
        dbContext.MedicinePriceHistories.Add(active);
        return active;
    }
}
