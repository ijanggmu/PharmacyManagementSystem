using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Makes a medicine price change reach the till. The lot's selling price is the only price a sale charges
/// (CreateSaleCommandHandler prices each lot drawn at its own price); <see cref="Medicine.UnitPrice"/> is the
/// default a lot starts at. Each change that takes effect now — the medicine form, a price schedule for
/// today, or a scheduled change whose date has arrived (<see cref="Jobs.ApplyDueMedicinePriceSchedulesJob"/>)
/// — moves every non-disposed lot still at the previous medicine price (or with no price), at every branch,
/// because the medicine price is tenant-wide. Empty lots move too: a return, a cancelled sale or a transfer
/// can put stock back into one. A lot given its own price (a different MRP printed on that lot, set on its
/// receipt or with <c>PUT /batches/{id}/selling-price</c>) keeps it. Lots are loaded tracked; the caller saves.
/// </summary>
public static class MedicinePriceApplier
{
    /// <summary>Moves the medicine's non-disposed lots still at <paramref name="previousUnitPrice"/> (or with no
    /// price) to <paramref name="unitPrice"/>; returns how many lots changed.</summary>
    public static async Task<int> RepriceLiveBatchesAsync(
        InventoryDbContext dbContext, Guid medicineId, decimal previousUnitPrice, decimal unitPrice, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (unitPrice <= 0m)
        {
            return 0;
        }

        var liveBatches = await dbContext.MedicineBatches
            .Where(b => b.MedicineId == medicineId && !b.IsDisposed && b.SellingPrice != unitPrice
                && (b.SellingPrice == previousUnitPrice || b.SellingPrice <= 0m))
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

        decimal previousUnitPrice = medicine.UnitPrice;
        medicine.ChangePrices(unitPrice, costPrice);
        var active = await MedicinePriceHistoryRecorder.RecordActiveAsync(
            dbContext, medicine.Id, unitPrice, costPrice, reason, cancellationToken).ConfigureAwait(false);
        await RepriceLiveBatchesAsync(dbContext, medicine.Id, previousUnitPrice, unitPrice, cancellationToken).ConfigureAwait(false);
        return active;
    }
}
