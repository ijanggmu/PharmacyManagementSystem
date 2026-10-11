using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Domain;

namespace FSH.Modules.Inventory.Services;

/// <summary>Per-medicine batch summary — nearest expiry, how many batch rows exist, their distinct
/// rack locations, and the FEFO-ordered lots a sale could actually draw from today. The .NET port of
/// medicine-service.ts's <c>aggregateBatchesByMedicine</c>/<c>decorateWithBatchAgg</c>.</summary>
public sealed record MedicineBatchAggregate(
    DateOnly? NearestExpiry,
    int Count,
    IReadOnlyList<string> RackLocations,
    IReadOnlyList<FefoPickDto> FefoPicks)
{
    public static readonly MedicineBatchAggregate Empty = new(null, 0, [], []);
}

/// <summary>
/// Groups already-fetched <see cref="MedicineBatch"/> rows by medicine into the summary above — pure,
/// no I/O, mirroring aggregateBatchesByMedicine's shape so callers that already have the rows (e.g.
/// SearchMedicinesQueryHandler after paging) don't re-query per medicine.
///
/// Count/rack locations include EVERY batch row passed in, regardless of quantity or disposed status.
/// <see cref="MedicineBatchAggregate.NearestExpiry"/> only considers lots that still hold stock (not
/// disposed, not recalled, quantity remaining) — like the legacy fetchBatchAggMap, which selected
/// <c>quantity_remaining &gt; 0</c> and <c>recalled_at is null</c>. Otherwise a lot that was already
/// written off or sold out keeps the medicine "expired"/"expiring" forever, so the stat cards, the
/// expiry filters and the expiry sort disagree with what is actually on the shelf. An expired lot that
/// still holds stock does count (it is what the "Expired" filter is for).
/// <see cref="MedicineBatchAggregate.FefoPicks"/> is the strict subset: not disposed, quantity
/// remaining, and not expired as of <c>today</c> (<see cref="FefoBatchOrdering"/>).
///
/// Recalled lots (<see cref="MedicineBatch.IsRecalled"/>) keep their stock on record but are excluded from
/// <see cref="MedicineBatchAggregate.FefoPicks"/> so the displayed picks match what a sale can draw from.
/// </summary>
public static class MedicineBatchAggregator
{
    public static Dictionary<Guid, MedicineBatchAggregate> Aggregate(IEnumerable<MedicineBatch> batches, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(batches);

        var result = new Dictionary<Guid, MedicineBatchAggregate>();
        foreach (var group in batches.GroupBy(b => b.MedicineId))
        {
            DateOnly? nearestExpiry = group
                .Where(b => !b.IsDisposed && !b.IsRecalled && b.QuantityOnHand > 0)
                .Min(b => (DateOnly?)b.ExpiryDate);
            int count = group.Count();
            var racks = group
                .Where(b => !string.IsNullOrWhiteSpace(b.RackLocation))
                .Select(b => b.RackLocation!)
                .Distinct()
                .ToList();
            var fefoPicks = group
                .Where(b => !b.IsDisposed && !b.IsRecalled && b.QuantityOnHand > 0 && FefoBatchOrdering.IsSellableOn(b.ExpiryDate, today))
                .OrderByFefo()
                .Select(b => new FefoPickDto(b.BatchNo, b.ExpiryDate, b.RackLocation, b.QuantityOnHand, b.SellingPrice))
                .ToList();

            result[group.Key] = new MedicineBatchAggregate(nearestExpiry, count, racks, fefoPicks);
        }

        return result;
    }

    public static MedicineBatchAggregate GetOrEmpty(this IReadOnlyDictionary<Guid, MedicineBatchAggregate> map, Guid medicineId)
    {
        ArgumentNullException.ThrowIfNull(map);
        return map.TryGetValue(medicineId, out var agg) ? agg : MedicineBatchAggregate.Empty;
    }
}
