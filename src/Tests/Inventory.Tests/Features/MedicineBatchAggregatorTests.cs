using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;

namespace Inventory.Tests.Features;

public sealed class MedicineBatchAggregatorTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    [Fact]
    public void Aggregate_Should_Order_FefoPicks_SoonestExpiryFirst_Then_ByReceiptDate()
    {
        var medicineId = Guid.CreateVersion7();

        // Two batches share the same (later) expiry — the earlier-received (earlier CreatedAtUtc) one
        // must come first on the tie. A third batch with a sooner expiry must sort ahead of both
        // regardless of receipt order (mirrors lib/inventory/fefo.ts's compareFefo).
        var tieOlderReceipt = MakeBatch(medicineId, "TIE-OLD", Today.AddDays(30), 5m, receivedAtUtc: DateTime.UtcNow.AddDays(-10));
        var tieNewerReceipt = MakeBatch(medicineId, "TIE-NEW", Today.AddDays(30), 5m, receivedAtUtc: DateTime.UtcNow.AddDays(-2));
        var soonExpiry = MakeBatch(medicineId, "SOON", Today.AddDays(10), 5m, receivedAtUtc: DateTime.UtcNow.AddDays(-1));

        var batches = new[] { tieNewerReceipt, soonExpiry, tieOlderReceipt };

        var result = MedicineBatchAggregator.Aggregate(batches, Today);

        var agg = result[medicineId];
        agg.FefoPicks.Select(p => p.BatchNo).ShouldBe(["SOON", "TIE-OLD", "TIE-NEW"]);
    }

    [Fact]
    public void Aggregate_Should_Exclude_Disposed_Expired_And_ZeroQuantity_Batches_From_FefoPicks_But_Still_Count_Them()
    {
        var medicineId = Guid.CreateVersion7();

        var sellable = MakeBatch(medicineId, "SELLABLE", Today.AddDays(5), 10m);

        var disposed = MakeBatch(medicineId, "DISPOSED", Today.AddDays(20), 10m);
        disposed.WriteOff();

        var expired = MakeBatch(medicineId, "EXPIRED", Today.AddDays(-1), 10m);

        var zeroQty = MakeBatch(medicineId, "ZERO", Today.AddDays(15), 0m);

        var batches = new[] { sellable, disposed, expired, zeroQty };

        var result = MedicineBatchAggregator.Aggregate(batches, Today);
        var agg = result[medicineId];

        // Only the still-sellable, non-disposed, quantity > 0 lot is a pick.
        agg.FefoPicks.Select(p => p.BatchNo).ShouldBe(["SELLABLE"]);

        // But every batch row — disposed, expired, zero-quantity included — is still counted. The
        // nearest expiry covers lots that still hold stock, so the expired-but-on-hand lot wins.
        agg.Count.ShouldBe(4);
        agg.NearestExpiry.ShouldBe(Today.AddDays(-1));
    }

    [Fact]
    public void Aggregate_NearestExpiry_Should_Ignore_Disposed_Recalled_And_SoldOut_Lots()
    {
        var medicineId = Guid.CreateVersion7();

        var writtenOff = MakeBatch(medicineId, "WRITTEN-OFF", Today.AddDays(-30), 10m);
        writtenOff.WriteOff();
        var soldOut = MakeBatch(medicineId, "SOLD-OUT", Today.AddDays(-10), 0m);
        var recalled = MakeBatch(medicineId, "RECALLED", Today.AddDays(3), 5m);
        _ = recalled.Recall("contamination", DateTime.UtcNow);
        var onShelf = MakeBatch(medicineId, "ON-SHELF", Today.AddDays(200), 5m);

        var agg = MedicineBatchAggregator.Aggregate([writtenOff, soldOut, recalled, onShelf], Today)[medicineId];

        agg.NearestExpiry.ShouldBe(Today.AddDays(200));
        agg.Count.ShouldBe(4);
    }

    [Fact]
    public void Aggregate_NearestExpiry_Should_Be_Null_When_No_Lot_Holds_Stock()
    {
        var medicineId = Guid.CreateVersion7();
        var soldOut = MakeBatch(medicineId, "SOLD-OUT", Today.AddDays(-10), 0m);

        var agg = MedicineBatchAggregator.Aggregate([soldOut], Today)[medicineId];

        agg.NearestExpiry.ShouldBeNull();
    }

    [Fact]
    public void Aggregate_Should_Collect_Distinct_RackLocations_Across_All_Batches()
    {
        var medicineId = Guid.CreateVersion7();
        var a = MakeBatch(medicineId, "A", Today.AddDays(5), 1m, rack: "R1");
        var b = MakeBatch(medicineId, "B", Today.AddDays(6), 1m, rack: "R1");
        var c = MakeBatch(medicineId, "C", Today.AddDays(7), 1m, rack: "R2");

        var result = MedicineBatchAggregator.Aggregate([a, b, c], Today);

        result[medicineId].RackLocations.ShouldBe(["R1", "R2"], ignoreOrder: true);
    }

    [Fact]
    public void GetOrEmpty_Should_Return_Empty_Aggregate_For_Unknown_Medicine()
    {
        var map = MedicineBatchAggregator.Aggregate([], Today);

        var agg = map.GetOrEmpty(Guid.CreateVersion7());

        agg.Count.ShouldBe(0);
        agg.NearestExpiry.ShouldBeNull();
        agg.RackLocations.ShouldBeEmpty();
        agg.FefoPicks.ShouldBeEmpty();
    }

    private static MedicineBatch MakeBatch(
        Guid medicineId, string batchNo, DateOnly expiryDate, decimal quantity, string? rack = null, DateTime? receivedAtUtc = null)
    {
        var batch = MedicineBatch.Create(medicineId, Guid.CreateVersion7(), batchNo, expiryDate, quantity, costPrice: 1m, sellingPrice: 2m, rackLocation: rack);
        if (receivedAtUtc is { } receivedAt)
        {
            // MedicineBatch.CreatedAtUtc is this schema's stand-in for the TS model's received_at
            // (see FefoBatchOrdering) and is set internally by Create() to "now" — reflection is the
            // only way to backdate it for a deterministic tie-break test without sleeping real time.
            typeof(MedicineBatch)
                .GetProperty(nameof(MedicineBatch.CreatedAtUtc))!
                .SetValue(batch, receivedAt);
        }

        return batch;
    }
}
