using FSH.Modules.Inventory.Domain;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Single source of truth for "first-expired-first-out" lot order, shared by actual stock deduction
/// (<see cref="StockDeductionService"/>) and read-side batch summaries
/// (<see cref="MedicineBatchAggregator"/>) so a medicine's displayed <c>fefo_picks</c> always matches
/// the lots a sale would actually draw from. The .NET port of lib/inventory/fefo.ts's
/// <c>compareFefo</c>/<c>isSellableOn</c>.
///
/// <see cref="MedicineBatch.ExpiryDate"/> is a non-nullable <c>DateOnly</c> in this schema (unlike the
/// TypeScript model's nullable <c>expiry_date</c>), so there is no "undated lots sort last" tier to
/// implement here. Expiry ties still break by receipt order — <see cref="MedicineBatch.CreatedAtUtc"/>
/// is this schema's nearest equivalent of <c>received_at</c>.
/// </summary>
public static class FefoBatchOrdering
{
    public static IOrderedQueryable<MedicineBatch> OrderByFefo(this IQueryable<MedicineBatch> source) =>
        source.OrderBy(b => b.ExpiryDate).ThenBy(b => b.CreatedAtUtc);

    public static IOrderedEnumerable<MedicineBatch> OrderByFefo(this IEnumerable<MedicineBatch> source) =>
        source.OrderBy(b => b.ExpiryDate).ThenBy(b => b.CreatedAtUtc);

    /// <summary>True when this lot is still eligible for sale on <paramref name="today"/>.</summary>
    public static bool IsSellableOn(DateOnly expiryDate, DateOnly today) => expiryDate >= today;
}
