using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;

namespace FSH.Modules.Inventory.Features.v1.StockCounts;

internal static class StockCountMapper
{
    public static StockCountSessionDto ToDto(StockCountSession s, int lineCount, int countedLineCount) =>
        new(s.Id, s.SessionNumber, s.Title, s.BranchId, s.Status.ToString(), s.CategoryId, s.RackLocation, s.SupplierId,
            s.Notes, s.CreatedAtUtc, s.SnapshotAtUtc, s.SubmittedAtUtc, s.PostedAtUtc, s.CancelledAtUtc,
            lineCount, countedLineCount, s.PostedGainValue, s.PostedLossValue);

    /// <summary>
    /// A line with its variance. Open session: expected = snapshot rolled forward by the lot's movements up to
    /// the count (<see cref="StockCountVariance"/>), computed now. Posted session: the figures frozen at posting.
    /// </summary>
    public static StockCountLineDto ToDto(
        StockCountLine line, bool posted, IReadOnlyList<LotMovement> movements, decimal? liveQuantity, DateTime nowUtc)
    {
        decimal? expected;
        decimal movementSum;
        if (posted)
        {
            expected = line.PostedExpectedQuantity;
            movementSum = (line.PostedExpectedQuantity ?? line.SnapshotQuantity) - line.SnapshotQuantity;
        }
        else
        {
            movementSum = StockCountVariance.MovementsBetween(line.SnapshotAtUtc, line.CountedAtUtc ?? nowUtc, movements);
            expected = line.CountedQuantity is null ? null : line.SnapshotQuantity + movementSum;
        }

        decimal? variance = line.CountedQuantity is { } counted && expected is { } exp
            ? StockCountVariance.Variance(counted, exp)
            : null;

        return new StockCountLineDto(
            line.Id, line.MedicineId, line.MedicineName, line.BatchId, line.BatchNo, line.ExpiryDate, line.RackLocation,
            line.UnitCost, line.SnapshotQuantity, line.SnapshotAtUtc, line.IsFoundLot, line.CountedQuantity,
            line.CountedAtUtc, line.Note, movementSum, expected, variance,
            variance is { } v ? Math.Round(v * line.UnitCost, 2, MidpointRounding.AwayFromZero) : null,
            liveQuantity, line.PostedDelta);
    }
}
