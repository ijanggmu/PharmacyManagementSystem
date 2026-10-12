using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// What a lot that is opened, re-opened or topped up from stock that already existed somewhere else
/// (a transfer arriving, a return or cancelled sale put back, a receipt of a known batch number) must
/// carry over so it does not quietly become sellable or mispriced:
///
/// <list type="bullet">
/// <item><b>Recall.</b> A recall is of a batch number, not of one row: every lot with the medicine's
/// batch number — at any branch, disposed or not — that is recalled makes a new or existing live lot of
/// the same number recalled too (same reason and time). Without this, stock that was in transit, or a lot
/// re-opened after the recalled one was written off, came back on the shelf as sellable.</item>
/// <item><b>Price.</b> The medicine's current <see cref="Medicine.UnitPrice"/>: a lot taking stock back
/// sells at today's price, not at the price written on a transfer when it was dispatched, or on the lot
/// when it last held stock.</item>
/// </list>
/// </summary>
internal sealed class LotInheritance
{
    private const int MaxNotesLength = 512;

    private readonly Dictionary<(Guid MedicineId, string BatchNo), MedicineBatch> _recalledByKey;
    private readonly Dictionary<Guid, decimal> _unitPrices;

    private LotInheritance(
        Dictionary<(Guid MedicineId, string BatchNo), MedicineBatch> recalledByKey, Dictionary<Guid, decimal> unitPrices)
    {
        _recalledByKey = recalledByKey;
        _unitPrices = unitPrices;
    }

    /// <summary>Loads the recalls and current prices of <paramref name="medicineIds"/> (plain reads, no locks).</summary>
    public static async Task<LotInheritance> LoadAsync(
        InventoryDbContext dbContext, IReadOnlyCollection<Guid> medicineIds, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(medicineIds);

        Guid[] ids = medicineIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new LotInheritance([], []);
        }

        var recalled = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => b.IsRecalled && ids.Contains(b.MedicineId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // The first recall of a batch number is the one carried over (its reason and time).
        var recalledByKey = recalled
            .GroupBy(b => (b.MedicineId, MedicineBatch.NormalizeBatchNo(b.BatchNo)))
            .ToDictionary(g => g.Key, g => g.OrderBy(b => b.RecalledAtUtc ?? DateTime.MaxValue).First());

        var unitPrices = await dbContext.Medicines.AsNoTracking()
            .Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, m.UnitPrice })
            .ToDictionaryAsync(m => m.Id, m => m.UnitPrice, cancellationToken)
            .ConfigureAwait(false);

        return new LotInheritance(recalledByKey, unitPrices);
    }

    /// <summary>The medicine's current selling price, or null when it has none set (zero) or is unknown.</summary>
    public decimal? CurrentUnitPrice(Guid medicineId) =>
        _unitPrices.TryGetValue(medicineId, out decimal price) && price > 0 ? price : null;

    /// <summary>Re-prices <paramref name="lot"/> at the medicine's current price, when it has one.</summary>
    public void ApplyCurrentPrice(MedicineBatch lot)
    {
        ArgumentNullException.ThrowIfNull(lot);
        if (CurrentUnitPrice(lot.MedicineId) is { } price)
        {
            lot.ChangeSellingPrice(price);
        }
    }

    /// <summary>
    /// Flags <paramref name="lot"/> recalled when its batch number is recalled anywhere for this medicine,
    /// adding the same zero-quantity <see cref="InventoryTransactionType.Recall"/> ledger entry the recall
    /// command writes. Returns true when the lot is (now) recalled.
    /// </summary>
    public bool ApplyRecall(InventoryDbContext dbContext, MedicineBatch lot)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(lot);
        if (lot.IsRecalled)
        {
            return true;
        }

        if (!_recalledByKey.TryGetValue((lot.MedicineId, MedicineBatch.NormalizeBatchNo(lot.BatchNo)), out var recalled))
        {
            return false;
        }

        lot.Recall(recalled.RecallReason, recalled.RecalledAtUtc ?? DateTime.UtcNow);
        string notes = string.IsNullOrWhiteSpace(recalled.RecallReason)
            ? "Batch recall carried over"
            : $"Batch recall carried over: {recalled.RecallReason}";
        dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
            lot.MedicineId, lot.BranchId, lot.Id, InventoryTransactionType.Recall, 0m, lot.CostPrice,
            referenceType: "recall", notes: notes.Length > MaxNotesLength ? notes[..MaxNotesLength] : notes));
        return true;
    }
}
