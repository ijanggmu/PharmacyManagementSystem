using FSH.Modules.Prescriptions.Data;
using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Services;

/// <summary>
/// Gives back to a prescription what a sale dispensed against it, when the sale is cancelled or medicine
/// from it is returned. Works from the sale's <see cref="PrescriptionDispenseEntry"/> rows, so it never gives
/// back more than that sale took, and gives back the refill slot once the sale holds none of the item.
/// Sales recorded before these rows existed hold nothing here and are left unchanged.
/// </summary>
public static class PrescriptionDispenseReversal
{
    /// <summary>Gives back what <paramref name="saleId"/> dispensed: <paramref name="returned"/> lists the
    /// medicine and quantity to give back, or null for everything the sale still holds. The reversal is
    /// recorded under <paramref name="referenceType"/>/<paramref name="referenceId"/>, once.</summary>
    public static async Task ReverseAsync(
        PrescriptionsDbContext dbContext, Guid saleId, string referenceType, Guid referenceId,
        IReadOnlyList<(Guid MedicineId, decimal Quantity)>? returned, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var entries = await dbContext.PrescriptionDispenseEntries
            .Where(e => e.SaleId == saleId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Idempotent: the triggering event can be redelivered.
        if (entries.Count == 0
            || entries.Any(e => e.ReferenceType == referenceType && e.ReferenceId == referenceId))
        {
            return;
        }

        var held = entries
            .GroupBy(e => e.PrescriptionItemId)
            .Select(g => new
            {
                ItemId = g.Key,
                g.First().PrescriptionId,
                g.First().MedicineId,
                Quantity = g.Sum(e => e.Quantity),
                Refills = g.Sum(e => e.RefillDelta),
            })
            .Where(h => h.Quantity > 0)
            .ToList();

        var toReturn = returned?
            .GroupBy(r => r.MedicineId)
            .ToDictionary(g => g.Key, g => g.Sum(r => r.Quantity));

        var itemIds = held.Select(h => h.ItemId).ToList();
        var items = await dbContext.PrescriptionItems
            .Where(i => itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, cancellationToken)
            .ConfigureAwait(false);

        foreach (var h in held)
        {
            decimal quantity = toReturn is null
                ? h.Quantity
                : Math.Min(h.Quantity, toReturn.GetValueOrDefault(h.MedicineId));
            if (quantity <= 0 || !items.TryGetValue(h.ItemId, out var item))
            {
                continue;
            }

            bool releaseRefill = quantity == h.Quantity && h.Refills > 0;
            item.ReverseDispense(quantity, releaseRefill);
            dbContext.PrescriptionDispenseEntries.Add(PrescriptionDispenseEntry.Create(
                saleId, h.PrescriptionId, h.ItemId, h.MedicineId, -quantity, releaseRefill ? -1 : 0, referenceType, referenceId));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
