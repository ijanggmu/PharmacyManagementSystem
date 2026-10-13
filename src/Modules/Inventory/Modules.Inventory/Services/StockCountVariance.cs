namespace FSH.Modules.Inventory.Services;

/// <summary>A stock movement on one lot (an <c>InventoryTransaction</c>): signed quantity at an instant.</summary>
public readonly record struct LotMovement(Guid BatchId, DateTime AtUtc, decimal QuantityDelta);

/// <summary>
/// Variance math for a stock count that runs while the pharmacy keeps trading.
///
/// <para>The shop does not close for a count. Between the snapshot (counting started) and the moment a
/// counter enters a lot's figure, the till may sell from that lot, a delivery may top it up, a transfer may
/// move it. Comparing the counted figure with the bare snapshot would book every sale made during the count
/// as a stock loss. So the expected quantity is the snapshot rolled forward by the lot's movements up to
/// the count:</para>
/// <code>
///   expected = snapshot + Σ movements in (snapshotAt, countedAt]
///   variance = counted − expected
/// </code>
/// <para>Movements AFTER the count was entered are not part of what the counter saw, so they don't belong in
/// the variance either; they are already in the lot's live quantity. Posting therefore applies the variance
/// on top of the live quantity rather than overwriting it with the counted figure:</para>
/// <code>
///   new on-hand = live on-hand + variance        (never below zero)
/// </code>
/// <para>Example: snapshot 100; 10 sold before the shelf is counted; counted 88; 5 more sold before posting.
/// Expected at count = 90, variance = −2 (two units missing), live = 85, posted = 83. Comparing with the
/// snapshot instead would have booked a loss of 12.</para>
/// </summary>
public static class StockCountVariance
{
    /// <summary>The lot's expected quantity when it was counted: the snapshot plus its movements after the
    /// snapshot instant and up to (including) the count instant.</summary>
    public static decimal ExpectedAtCount(
        decimal snapshotQuantity, DateTime snapshotAtUtc, DateTime countedAtUtc, IEnumerable<LotMovement> movements)
    {
        ArgumentNullException.ThrowIfNull(movements);
        return snapshotQuantity + MovementsBetween(snapshotAtUtc, countedAtUtc, movements);
    }

    /// <summary>Net movement of a lot in <c>(fromUtc, toUtc]</c>.</summary>
    public static decimal MovementsBetween(DateTime fromUtc, DateTime toUtc, IEnumerable<LotMovement> movements)
    {
        ArgumentNullException.ThrowIfNull(movements);
        return movements.Where(m => m.AtUtc > fromUtc && m.AtUtc <= toUtc).Sum(m => m.QuantityDelta);
    }

    /// <summary>Counted minus expected: positive = stock found (gain), negative = stock missing (loss).</summary>
    public static decimal Variance(decimal countedQuantity, decimal expectedQuantity) => countedQuantity - expectedQuantity;

    /// <summary>The lot's quantity after posting: the variance applied to the live quantity, floored at zero
    /// (stock sold after the count can not take a lot below empty).</summary>
    public static decimal QuantityAfterPosting(decimal liveQuantity, decimal variance) => Math.Max(0m, liveQuantity + variance);
}
