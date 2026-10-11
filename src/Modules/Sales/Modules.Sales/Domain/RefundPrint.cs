using FSH.Framework.Core.Domain;

namespace FSH.Modules.Sales.Domain;

/// <summary>One row per credit-note print — reprints are marked "COPY OF ORIGINAL — n", like invoices
/// (see <see cref="SalePrint"/>).</summary>
public sealed class RefundPrint : BaseEntity<Guid>
{
    public Guid RefundId { get; private set; }
    public Guid BranchId { get; private set; }
    public int PrintNumber { get; private set; }
    public string Format { get; private set; } = default!;
    public Guid? PrintedByUserId { get; private set; }
    public DateTime PrintedAtUtc { get; private set; }

    private RefundPrint() { }

    public static RefundPrint Record(Guid refundId, Guid branchId, int printNumber, string format, Guid? printedByUserId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(format);
        return new RefundPrint
        {
            Id = Guid.CreateVersion7(),
            RefundId = refundId,
            BranchId = branchId,
            PrintNumber = printNumber,
            Format = format.Trim(),
            PrintedByUserId = printedByUserId,
            PrintedAtUtc = DateTime.UtcNow,
        };
    }
}
