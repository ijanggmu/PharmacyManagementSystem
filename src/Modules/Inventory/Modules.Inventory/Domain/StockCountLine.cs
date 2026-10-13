using FSH.Framework.Core.Domain;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// One lot in a <see cref="StockCountSession"/>: the system quantity snapshotted when counting started (or
/// when a found lot was added), and what the counter found on the shelf. Independent entity (own DbSet).
/// </summary>
public sealed class StockCountLine : AggregateRoot<Guid>
{
    public Guid SessionId { get; private set; }
    public Guid MedicineId { get; private set; }
    public string MedicineName { get; private set; } = default!;

    /// <summary>The lot counted. Null only for a found lot the system did not know yet (created on posting).</summary>
    public Guid? BatchId { get; private set; }
    public string BatchNo { get; private set; } = default!;
    public DateOnly? ExpiryDate { get; private set; }
    public string? RackLocation { get; private set; }

    /// <summary>The lot's cost per unit — what a variance is valued at.</summary>
    public decimal UnitCost { get; private set; }

    /// <summary>System quantity when this line was snapshotted.</summary>
    public decimal SnapshotQuantity { get; private set; }

    /// <summary>When <see cref="SnapshotQuantity"/> was read: the session's start, or when a found lot was added.</summary>
    public DateTime SnapshotAtUtc { get; private set; }

    /// <summary>Added during counting (not in the start snapshot).</summary>
    public bool IsFoundLot { get; private set; }

    /// <summary>Counted quantity; null = not counted yet (an uncounted line is left as it is when posting).</summary>
    public decimal? CountedQuantity { get; private set; }

    /// <summary>When the count was entered — movements up to this instant are part of what the counter saw.</summary>
    public DateTime? CountedAtUtc { get; private set; }
    public string? Note { get; private set; }

    /// <summary>Frozen on posting: expected quantity at count time (snapshot + movements until then).</summary>
    public decimal? PostedExpectedQuantity { get; private set; }

    /// <summary>Frozen on posting: the quantity change actually applied to the lot.</summary>
    public decimal? PostedDelta { get; private set; }

    private StockCountLine() { }

    public static StockCountLine Create(
        Guid sessionId, Guid medicineId, string medicineName, Guid? batchId, string batchNo, DateOnly? expiryDate,
        string? rackLocation, decimal unitCost, decimal snapshotQuantity, DateTime snapshotAtUtc, bool isFoundLot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(batchNo);
        return new StockCountLine
        {
            Id = Guid.CreateVersion7(),
            SessionId = sessionId,
            MedicineId = medicineId,
            MedicineName = string.IsNullOrWhiteSpace(medicineName) ? "Unknown medicine" : medicineName.Trim(),
            BatchId = batchId,
            BatchNo = MedicineBatch.NormalizeBatchNo(batchNo),
            ExpiryDate = expiryDate,
            RackLocation = string.IsNullOrWhiteSpace(rackLocation) ? null : rackLocation.Trim(),
            UnitCost = unitCost,
            SnapshotQuantity = snapshotQuantity,
            SnapshotAtUtc = snapshotAtUtc,
            IsFoundLot = isFoundLot,
        };
    }

    /// <summary>Records (or clears, with null) the counted quantity.</summary>
    public void RecordCount(decimal? countedQuantity, string? note, DateTime nowUtc)
    {
        if (countedQuantity is < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(countedQuantity), countedQuantity, "Counted quantity cannot be negative.");
        }

        CountedQuantity = countedQuantity;
        CountedAtUtc = countedQuantity is null ? null : nowUtc;
        if (note is not null)
        {
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        }
    }

    /// <summary>A lot's expiry for the count sheet: null for a non-expiring lot.</summary>
    public static DateOnly? ExpiryOf(DateOnly lotExpiry) => lotExpiry == MedicineBatch.NoExpiryDate ? null : lotExpiry;

    /// <summary>Ties a found lot recorded by batch number to the system lot it turned out to be.</summary>
    public void LinkBatch(Guid batchId) => BatchId = batchId;

    public void MarkPosted(Guid batchId, decimal expectedQuantity, decimal appliedDelta)
    {
        BatchId = batchId;
        PostedExpectedQuantity = expectedQuantity;
        PostedDelta = appliedDelta;
    }
}
