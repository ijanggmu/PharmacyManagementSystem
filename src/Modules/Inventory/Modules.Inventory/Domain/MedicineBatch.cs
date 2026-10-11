using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// Independent top-level entity (own DbSet), not reached through <see cref="Medicine"/>'s
/// navigation — batches are read/written far too often on their own (FEFO deduction, receiving,
/// adjustment) to model as a nav-collection child, which sidesteps the nav-child
/// <c>ValueGeneratedNever</c> footgun entirely (database.md).
/// </summary>
public sealed class MedicineBatch : AggregateRoot<Guid>
{
    /// <summary>
    /// Stored expiry for a lot received without one. Legacy (lib/inventory/fefo.ts) treats a null
    /// expiry as sellable forever and orders it last; DateOnly.MaxValue reproduces both behaviours
    /// without making the column nullable (FefoBatchOrdering relies on a non-null ExpiryDate).
    /// </summary>
    public static readonly DateOnly NoExpiryDate = DateOnly.MaxValue;

    public Guid MedicineId { get; private set; }

    /// <summary>The branch this lot physically belongs to — required, resolved via
    /// <c>ICurrentBranch.RequireBranchIdAsync()</c> at creation (docs/branch-scoping-plan.md).
    /// FEFO deduction (<see cref="FSH.Modules.Inventory.Services.StockDeductionService"/>) filters
    /// candidate batches by this so a sale at one branch can never draw down another branch's stock.</summary>
    public Guid BranchId { get; private set; }
    public string BatchNo { get; private set; } = default!;
    public DateOnly ExpiryDate { get; private set; }
    public decimal QuantityOnHand { get; private set; }

    /// <summary>Quantity received when the lot was first created (the "received" figure). Null only on rows written before this was recorded.</summary>
    public decimal? InitialQuantity { get; private set; }
    public decimal CostPrice { get; private set; }
    public decimal SellingPrice { get; private set; }
    public string? RackLocation { get; private set; }
    public bool IsDisposed { get; private set; }

    /// <summary>
    /// Product recall flag. A recalled lot keeps its <see cref="QuantityOnHand"/> (no write-off) but is never
    /// deducted or priced for sale (FEFO selection in StockDeductionService, sale pricing via SearchBatches).
    /// </summary>
    public bool IsRecalled { get; private set; }
    public DateTime? RecalledAtUtc { get; private set; }
    public string? RecallReason { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private MedicineBatch() { }

    public static MedicineBatch Create(
        Guid medicineId, Guid branchId, string batchNo, DateOnly expiryDate, decimal quantity,
        decimal costPrice, decimal sellingPrice, string? rackLocation)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(batchNo);
        if (quantity < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity), quantity, "Initial quantity cannot be negative.");
        }

        return new MedicineBatch
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            BranchId = branchId,
            BatchNo = NormalizeBatchNo(batchNo),
            ExpiryDate = expiryDate,
            QuantityOnHand = quantity,
            InitialQuantity = quantity,
            CostPrice = costPrice,
            SellingPrice = sellingPrice,
            RackLocation = rackLocation?.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>
    /// Canonical batch number: trimmed, inner whitespace collapsed to one space, upper-cased, so
    /// "pcm 2401", "PCM  2401" and "PCM 2401" name the same lot. Lookups compare against
    /// <c>BatchNo.ToUpper()</c> so lots stored before normalization still match.
    /// </summary>
    public static string NormalizeBatchNo(string batchNo)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(batchNo);
        return string.Join(' ', batchNo.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
            .ToUpperInvariant();
    }

    public void Increase(decimal quantity)
    {
        EnsureNotDisposed();
        if (quantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity), quantity, "Quantity to add must be positive.");
        }

        QuantityOnHand += quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Deducts up to the requested amount; throws if the batch can't cover it — the caller
    /// (StockDeductionService) is responsible for splitting a request across multiple batches.</summary>
    public void Deduct(decimal quantity)
    {
        EnsureNotDisposed();
        if (quantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity), quantity, "Quantity to deduct must be positive.");
        }

        if (quantity > QuantityOnHand)
        {
            throw new CustomException(
                $"Batch {BatchNo} only has {QuantityOnHand} on hand, cannot deduct {quantity}.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        QuantityOnHand -= quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public decimal SetQuantity(decimal newQuantity)
    {
        EnsureNotDisposed();
        if (newQuantity < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(newQuantity), newQuantity, "Quantity cannot be negative.");
        }

        decimal delta = newQuantity - QuantityOnHand;
        QuantityOnHand = newQuantity;
        UpdatedAtUtc = DateTime.UtcNow;
        return delta;
    }

    public decimal WriteOff()
    {
        EnsureNotDisposed();
        decimal remaining = QuantityOnHand;
        QuantityOnHand = 0;
        IsDisposed = true;
        UpdatedAtUtc = DateTime.UtcNow;
        return remaining;
    }

    /// <summary>
    /// Flags this lot as recalled. Quantity is untouched. Returns false when the lot was already recalled
    /// (the stored flag, timestamp and reason are kept as first recorded).
    /// </summary>
    public bool Recall(string? reason, DateTime recalledAtUtc)
    {
        EnsureNotDisposed();
        if (IsRecalled)
        {
            return false;
        }

        IsRecalled = true;
        RecalledAtUtc = recalledAtUtc;
        RecallReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        UpdatedAtUtc = recalledAtUtc;
        return true;
    }

    private void EnsureNotDisposed()
    {
        if (IsDisposed)
        {
            throw new CustomException(
                $"Batch {BatchNo} has been disposed and can no longer be modified.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
