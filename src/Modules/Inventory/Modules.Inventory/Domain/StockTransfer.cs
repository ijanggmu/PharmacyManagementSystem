using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Inventory.Domain;

public enum StockTransferStatus
{
    InTransit = 0,
    Completed = 1,
    Cancelled = 2,
}

/// <summary>
/// Inter-location stock transfer state machine, ported from the source system's
/// create_stock_transfer/receive_stock_transfer/cancel_stock_transfer Postgres functions
/// (scripts/96-stock-transfer-in-transit.sql): dispatch debits the source location and leaves the
/// transfer <see cref="StockTransferStatus.InTransit"/>; <see cref="MarkReceived"/> credits the
/// destination and completes it; <see cref="Cancel"/> (only while still in-transit) credits the
/// source back. Once <see cref="StockTransferStatus.Completed"/> or
/// <see cref="StockTransferStatus.Cancelled"/> the transfer is immutable — same as any other posted
/// transaction.
/// </summary>
public sealed class StockTransfer : AggregateRoot<Guid>
{
    private readonly List<StockTransferItem> _items = [];

    public string TransferNumber { get; private set; } = default!;
    public Guid FromLocationId { get; private set; }
    public Guid ToLocationId { get; private set; }

    /// <summary>The caller's current branch at dispatch time — required, resolved via
    /// <c>ICurrentBranch.RequireBranchIdAsync()</c> in <c>CreateStockTransferCommandHandler</c>
    /// (docs/branch-scoping-plan.md), never taken from client input.</summary>
    public Guid FromBranchId { get; private set; }

    /// <summary>The destination branch chosen by the user — an explicit command input, not resolved
    /// ambiently (a transfer's destination is not the caller's own branch).</summary>
    public Guid ToBranchId { get; private set; }
    public StockTransferStatus Status { get; private set; } = StockTransferStatus.InTransit;
    public string? Notes { get; private set; }
    public Guid CreatedByUserId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ReceivedAtUtc { get; private set; }
    public Guid? ReceivedByUserId { get; private set; }
    public DateTime? CancelledAtUtc { get; private set; }
    public Guid? CancelledByUserId { get; private set; }
    public string? CancellationReason { get; private set; }

    public IReadOnlyList<StockTransferItem> Items => _items;

    private StockTransfer() { }

    /// <summary>
    /// Each branch is one stock location, so the location ids mirror the branch ids. Stock itself moves as
    /// <see cref="MedicineBatch"/> rows (see <see cref="StockTransferBatch"/>), not through
    /// <see cref="MedicineLocationStock"/>.
    /// </summary>
    public static StockTransfer Create(
        Guid fromBranchId, Guid toBranchId, Guid createdByUserId, string? notes,
        IReadOnlyList<(Guid MedicineId, decimal Quantity)> lines)
    {
        if (fromBranchId == toBranchId)
        {
            throw new CustomException(
                "Source and destination branch must differ.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (lines is null || lines.Count == 0)
        {
            throw new CustomException(
                "At least one item is required.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var transfer = new StockTransfer
        {
            Id = Guid.CreateVersion7(),
            TransferNumber = $"TRF-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            FromLocationId = fromBranchId,
            ToLocationId = toBranchId,
            FromBranchId = fromBranchId,
            ToBranchId = toBranchId,
            CreatedByUserId = createdByUserId,
            Notes = notes?.Trim(),
            Status = StockTransferStatus.InTransit,
            CreatedAtUtc = DateTime.UtcNow,
        };

        foreach (var (medicineId, quantity) in lines)
        {
            if (quantity <= 0)
            {
                throw new CustomException(
                    $"quantity must be positive for medicine {medicineId}.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            var item = StockTransferItem.Create(medicineId, quantity);
            item.AssignTransfer(transfer.Id);
            transfer._items.Add(item);
        }

        return transfer;
    }

    /// <summary>Completes the transfer. Only from <see cref="StockTransferStatus.InTransit"/> — the caller is
    /// responsible for creating or increasing the destination <see cref="MedicineBatch"/> rows after this succeeds.</summary>
    public void MarkReceived(Guid actorUserId)
    {
        EnsureInTransit("received");
        Status = StockTransferStatus.Completed;
        ReceivedAtUtc = DateTime.UtcNow;
        ReceivedByUserId = actorUserId;
    }

    /// <summary>Only while still in-transit — the destination was never touched (receive hadn't
    /// happened yet), so cancelling only needs to credit the source back.</summary>
    public void Cancel(Guid actorUserId, string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        EnsureInTransit("cancelled");
        Status = StockTransferStatus.Cancelled;
        CancelledAtUtc = DateTime.UtcNow;
        CancelledByUserId = actorUserId;
        CancellationReason = reason.Trim();
    }

    private void EnsureInTransit(string action)
    {
        if (Status != StockTransferStatus.InTransit)
        {
            throw new CustomException(
                $"Only in-transit transfers can be {action} (current status: {Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
