using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Each medicine's latest purchase cost and selling price, from its most recently created lot that carries a cost
/// (see <see cref="GetLatestLotPricesQuery"/>).
/// </summary>
internal static class LatestLotPrices
{
    public static async Task<Dictionary<Guid, LatestLotPriceDto>> LoadAsync(
        InventoryDbContext dbContext, IReadOnlyCollection<Guid> medicineIds, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(medicineIds);
        if (medicineIds.Count == 0)
        {
            return [];
        }

        var lots = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => medicineIds.Contains(b.MedicineId) && b.CostPrice > 0m)
            .Select(b => new { b.MedicineId, b.CostPrice, b.SellingPrice, b.CreatedAtUtc, b.Id })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return lots
            .GroupBy(b => b.MedicineId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var latest = g.OrderByDescending(b => b.CreatedAtUtc).ThenByDescending(b => b.Id).First();
                    return new LatestLotPriceDto(latest.CostPrice, latest.SellingPrice);
                });
    }
}
