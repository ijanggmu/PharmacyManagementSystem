using FSH.Modules.Inventory.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// The batch is the only selling price; the medicine's price is the default a new batch starts at. When
/// the medicine's price changes, the batches still at the old default move with it, so changing the
/// medicine price changes what its stock sells for. A batch given its own price (a different MRP on that
/// lot) keeps it.
/// </summary>
public static class BatchSellingPrices
{
    /// <summary>Re-prices the live batches of <paramref name="medicineId"/> still at
    /// <paramref name="previousPrice"/> (or with no price) to <paramref name="newPrice"/>. The caller saves.</summary>
    public static async Task FollowMedicinePriceAsync(
        InventoryDbContext dbContext, Guid medicineId, decimal previousPrice, decimal newPrice, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (newPrice <= 0 || newPrice == previousPrice)
        {
            return;
        }

        // Scoped by MedicineId (a globally unique id), so this also works from a background job, which has no
        // tenant context: the tenant filter is bypassed and the medicine id keeps it to that tenant's rows.
        var following = await dbContext.MedicineBatches
            .IgnoreQueryFilters()
            .Where(b => b.MedicineId == medicineId && !b.IsDisposed && (b.SellingPrice == previousPrice || b.SellingPrice <= 0))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        foreach (var batch in following)
        {
            batch.ChangeSellingPrice(newPrice);
        }
    }
}
