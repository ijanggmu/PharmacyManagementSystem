using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Makes a medicine price change reach the till. A sale charges the FEFO lot's own selling price
/// whenever it is above zero (CreateSaleCommandHandler), so changing only
/// <see cref="Medicine.UnitPrice"/> would leave every lot already on the shelf selling at the old
/// price. Each change that takes effect now — the medicine form, a price schedule for today, or a
/// scheduled change whose date has arrived (<see cref="Jobs.ApplyDueMedicinePriceSchedulesJob"/>) —
/// re-prices the medicine's live lots (not disposed, stock remaining) at every branch, because the
/// medicine price is tenant-wide. Lots are loaded tracked; the caller saves.
/// </summary>
public static class MedicinePriceApplier
{
    /// <summary>Sets the selling price of the medicine's live lots; returns how many lots changed.</summary>
    public static async Task<int> RepriceLiveBatchesAsync(
        InventoryDbContext dbContext, Guid medicineId, decimal unitPrice, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var liveBatches = await dbContext.MedicineBatches
            .Where(b => b.MedicineId == medicineId && !b.IsDisposed && b.QuantityOnHand > 0 && b.SellingPrice != unitPrice)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        foreach (var batch in liveBatches)
        {
            batch.ChangeSellingPrice(unitPrice);
        }

        return liveBatches.Count;
    }

    /// <summary>
    /// Applies a price change effective today: the medicine's prices, a new 'Active' price-history row
    /// (superseding the current one) and the live lots' selling price. The caller saves.
    /// </summary>
    public static async Task<MedicinePriceHistory> ApplyNowAsync(
        InventoryDbContext dbContext, Medicine medicine, decimal unitPrice, decimal? costPrice, string? reason,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(medicine);

        medicine.ChangePrices(unitPrice, costPrice);
        var active = await MedicinePriceHistoryRecorder.RecordActiveAsync(
            dbContext, medicine.Id, unitPrice, costPrice, reason, cancellationToken).ConfigureAwait(false);
        await RepriceLiveBatchesAsync(dbContext, medicine.Id, unitPrice, cancellationToken).ConfigureAwait(false);
        return active;
    }
}
