using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// One posted month of book depreciation for one asset, written by a <see cref="DepreciationRun"/> in the same
/// transaction as its voucher. Unique per (tenant, asset, period): that index is what makes depreciation idempotent —
/// a second run of the same period finds the months posted and skips them, and two concurrent runs can't both post
/// one month. Removed again when the run is reversed.
/// </summary>
public sealed class FixedAssetDepreciationEntry : AggregateRoot<Guid>
{
    public Guid AssetId { get; private set; }
    public Guid RunId { get; private set; }

    /// <summary><see cref="FiscalPeriod.Index"/> of the month.</summary>
    public int Period { get; private set; }
    public int FiscalYear { get; private set; }

    /// <summary>1 = Shrawan … 12 = Ashadh.</summary>
    public int FiscalMonth { get; private set; }
    public decimal Amount { get; private set; }
    public Guid? BranchId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private FixedAssetDepreciationEntry() { }

    public static FixedAssetDepreciationEntry Create(Guid assetId, Guid runId, int period, decimal amount, Guid? branchId)
    {
        if (amount <= 0m)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "A depreciation entry must be positive.");
        }

        var fiscal = FiscalPeriod.FromIndex(period);
        return new FixedAssetDepreciationEntry
        {
            Id = Guid.CreateVersion7(),
            AssetId = assetId,
            RunId = runId,
            Period = period,
            FiscalYear = fiscal.FiscalYear,
            FiscalMonth = fiscal.Month,
            Amount = amount,
            BranchId = branchId,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
