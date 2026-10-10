using FSH.Framework.Core.Domain;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// One row per time an invoice was printed. IRD requires reprints to be marked as copies
/// ("COPY OF ORIGINAL — n"), so the copy number is derived from how many prints came before.
/// Kept apart from <see cref="Sale"/> on purpose: an IRD-synced sale is locked against changes, but
/// printing it again must still be possible and recorded.
/// </summary>
public sealed class SalePrint : BaseEntity<Guid>
{
    public Guid SaleId { get; private set; }
    public Guid BranchId { get; private set; }

    /// <summary>1 for the original, 2+ for copies.</summary>
    public int PrintNumber { get; private set; }

    /// <summary>Paper/layout used, e.g. "thermal-58", "thermal-80", "a5".</summary>
    public string Format { get; private set; } = default!;

    public Guid? PrintedByUserId { get; private set; }
    public DateTime PrintedAtUtc { get; private set; }

    private SalePrint() { }

    public static SalePrint Record(Guid saleId, Guid branchId, int printNumber, string format, Guid? printedByUserId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(format);
        return new SalePrint
        {
        Id = Guid.CreateVersion7(),
        SaleId = saleId,
        BranchId = branchId,
        PrintNumber = printNumber,
        Format = format.Trim(),
        PrintedByUserId = printedByUserId,
        PrintedAtUtc = DateTime.UtcNow,
        };
    }
}
