using System.Globalization;
using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Inventory.Domain;

public enum StockCountStatus
{
    /// <summary>Scope chosen, nothing snapshotted yet.</summary>
    Draft = 0,

    /// <summary>System quantities snapshotted per lot; counters are entering counted quantities.</summary>
    Counting = 1,

    /// <summary>Counting closed; variances are being reviewed before posting.</summary>
    Review = 2,

    /// <summary>Variances applied to the lots and posted to the books. Final.</summary>
    Posted = 3,

    /// <summary>Abandoned without touching stock. Final.</summary>
    Cancelled = 4,
}

/// <summary>
/// A physical stock count of one branch: all lots, or the lots of one category / rack / preferred supplier.
/// Starting it snapshots each lot's system quantity (<see cref="StockCountLine"/>); counters then record
/// what is on the shelf; posting applies the variances as <see cref="InventoryTransactionType.Adjustment"/>
/// movements and posts the stock gain / loss to the books. Lines are their own aggregate (own DbSet): a
/// count of a whole pharmacy has thousands of them and they are written one scan at a time.
/// </summary>
public sealed class StockCountSession : AggregateRoot<Guid>
{
    public string SessionNumber { get; private set; } = default!;
    public string Title { get; private set; } = default!;
    public Guid BranchId { get; private set; }
    public StockCountStatus Status { get; private set; }

    /// <summary>Scope: only lots of medicines in this category (Reference module id). Null = any.</summary>
    public Guid? CategoryId { get; private set; }

    /// <summary>Scope: only lots on this rack (case-insensitive match on the lot's rack). Null = any.</summary>
    public string? RackLocation { get; private set; }

    /// <summary>Scope: only lots of medicines whose preferred supplier is this one. Null = any.</summary>
    public Guid? SupplierId { get; private set; }

    public string? Notes { get; private set; }

    /// <summary>When the system quantities were snapshotted (counting started).</summary>
    public DateTime? SnapshotAtUtc { get; private set; }
    public DateTime? SubmittedAtUtc { get; private set; }
    public DateTime? PostedAtUtc { get; private set; }
    public Guid? PostedBy { get; private set; }
    public DateTime? CancelledAtUtc { get; private set; }

    /// <summary>Value (at lot cost) of the stock gained when posted; consigned lots excluded.</summary>
    public decimal PostedGainValue { get; private set; }

    /// <summary>Value (at lot cost, positive) of the stock lost when posted; consigned lots excluded.</summary>
    public decimal PostedLossValue { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private StockCountSession() { }

    public static StockCountSession Create(
        Guid branchId, string? title, Guid? categoryId, string? rackLocation, Guid? supplierId, string? notes, DateTime nowUtc)
    {
        string number = string.Create(CultureInfo.InvariantCulture, $"SC-{nowUtc:yyMMdd-HHmmss}");
        return new StockCountSession
        {
            Id = Guid.CreateVersion7(),
            SessionNumber = number,
            Title = string.IsNullOrWhiteSpace(title) ? number : title.Trim(),
            BranchId = branchId,
            Status = StockCountStatus.Draft,
            CategoryId = categoryId,
            RackLocation = string.IsNullOrWhiteSpace(rackLocation) ? null : rackLocation.Trim(),
            SupplierId = supplierId,
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            CreatedAtUtc = nowUtc,
        };
    }

    public void Start(DateTime snapshotAtUtc)
    {
        EnsureStatus(StockCountStatus.Draft, "start counting");
        Status = StockCountStatus.Counting;
        SnapshotAtUtc = snapshotAtUtc;
        UpdatedAtUtc = snapshotAtUtc;
    }

    public void SubmitForReview(DateTime nowUtc)
    {
        EnsureStatus(StockCountStatus.Counting, "submit for review");
        Status = StockCountStatus.Review;
        SubmittedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    public void Reopen(DateTime nowUtc)
    {
        EnsureStatus(StockCountStatus.Review, "reopen counting");
        Status = StockCountStatus.Counting;
        SubmittedAtUtc = null;
        UpdatedAtUtc = nowUtc;
    }

    public void MarkPosted(DateTime nowUtc, Guid? postedBy, decimal gainValue, decimal lossValue)
    {
        EnsureStatus(StockCountStatus.Review, "post");
        Status = StockCountStatus.Posted;
        PostedAtUtc = nowUtc;
        PostedBy = postedBy;
        PostedGainValue = gainValue;
        PostedLossValue = lossValue;
        UpdatedAtUtc = nowUtc;
    }

    public void Cancel(DateTime nowUtc)
    {
        if (Status is StockCountStatus.Posted or StockCountStatus.Cancelled)
        {
            throw Conflict($"Stock count {SessionNumber} is {Status} and can no longer be cancelled.");
        }

        Status = StockCountStatus.Cancelled;
        CancelledAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>Counts can only be entered while the session is counting.</summary>
    public void EnsureCounting() => EnsureStatus(StockCountStatus.Counting, "record counts");

    private void EnsureStatus(StockCountStatus expected, string action)
    {
        if (Status != expected)
        {
            throw Conflict($"Stock count {SessionNumber} is {Status}; it must be {expected} to {action}.");
        }
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}
