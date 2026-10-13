using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// One posted book-depreciation run for one branch and one period (a fiscal month, or months
/// <see cref="FromMonth"/>–<see cref="ToMonth"/> of a fiscal year). Its voucher (<see cref="VoucherType"/>, JV series)
/// carries reference <see cref="ReferenceType"/> / the run id; its months are the
/// <see cref="FixedAssetDepreciationEntry"/> rows with this <c>RunId</c>.
/// </summary>
public sealed class DepreciationRun : AggregateRoot<Guid>
{
    public const string VoucherType = "system_depreciation";
    public const string ReferenceType = "DepreciationRun";

    public int FiscalYear { get; private set; }
    public int FromMonth { get; private set; }
    public int ToMonth { get; private set; }
    public Guid? BranchId { get; private set; }
    public decimal TotalAmount { get; private set; }
    public int AssetCount { get; private set; }
    public Guid? VoucherId { get; private set; }
    public DateTime PostedAtUtc { get; private set; }
    public string PostedBy { get; private set; } = default!;
    public DateTime? ReversedAtUtc { get; private set; }
    public string? ReversedBy { get; private set; }
    public Guid? ReversalVoucherId { get; private set; }

    private DepreciationRun() { }

    public static DepreciationRun Create(
        int fiscalYear, int fromMonth, int toMonth, Guid? branchId, decimal totalAmount, int assetCount, string postedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(postedBy);
        return new DepreciationRun
        {
            Id = Guid.CreateVersion7(),
            FiscalYear = fiscalYear,
            FromMonth = fromMonth,
            ToMonth = toMonth,
            BranchId = branchId,
            TotalAmount = totalAmount,
            AssetCount = assetCount,
            PostedAtUtc = DateTime.UtcNow,
            PostedBy = postedBy,
        };
    }

    public bool IsReversed => ReversedAtUtc is not null;

    public void AttachVoucher(Guid voucherId) => VoucherId = voucherId;

    public void MarkReversed(string reversedBy, Guid reversalVoucherId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reversedBy);
        ReversedAtUtc = DateTime.UtcNow;
        ReversedBy = reversedBy;
        ReversalVoucherId = reversalVoucherId;
    }
}
