using System.Data;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.RecordStockCounts;

/// <summary>
/// Writes counted quantities. Each entry either updates a line already on the sheet, or adds a found lot:
/// an existing lot of the branch that was not in the snapshot (zero stock at start, or outside the scope) is
/// snapshotted now, at its live quantity; a lot the system does not know at all is added with a zero
/// snapshot and created when the count is posted. The session row is locked so counts can't land while
/// the session is being submitted or posted.
/// </summary>
public sealed class RecordStockCountsCommandHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider)
    : ICommandHandler<RecordStockCountsCommand, IReadOnlyList<Guid>>
{
    public async ValueTask<IReadOnlyList<Guid>> Handle(RecordStockCountsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var session = await StockCountStore.LockSessionAsync(dbContext, currentBranch, command.SessionId, cancellationToken)
            .ConfigureAwait(false);
        session.EnsureCounting();

        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        var lines = await dbContext.StockCountLines
            .Where(l => l.SessionId == session.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var written = new List<Guid>(command.Entries.Count);
        foreach (var entry in command.Entries)
        {
            var line = entry.LineId is { } lineId
                ? lines.FirstOrDefault(l => l.Id == lineId)
                    ?? throw new NotFoundException($"Line {lineId} is not on stock count {session.SessionNumber}.")
                : await FindOrAddFoundLotAsync(session, lines, entry, now, cancellationToken).ConfigureAwait(false);

            line.RecordCount(entry.CountedQuantity, entry.Note, now);
            written.Add(line.Id);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return written;
    }

    private async Task<StockCountLine> FindOrAddFoundLotAsync(
        StockCountSession session, List<StockCountLine> lines, StockCountEntryInput entry, DateTime now,
        CancellationToken cancellationToken)
    {
        Guid medicineId = entry.MedicineId ?? throw BadRequest("A found lot needs its medicine.");

        MedicineBatch? batch;
        if (entry.BatchId is { } batchId)
        {
            batch = await dbContext.MedicineBatches.AsNoTracking()
                .FirstOrDefaultAsync(b => b.Id == batchId, cancellationToken)
                .ConfigureAwait(false);
            if (batch is null || batch.BranchId != session.BranchId || batch.MedicineId != medicineId)
            {
                throw new NotFoundException($"Batch {batchId} not found at this branch for that medicine.");
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(entry.BatchNo))
            {
                throw BadRequest("A found lot needs its batch number.");
            }

            string batchNo = MedicineBatch.NormalizeBatchNo(entry.BatchNo);
            var onSheet = lines.FirstOrDefault(l => l.MedicineId == medicineId && l.BatchNo == batchNo);
            if (onSheet is not null)
            {
                return onSheet;
            }

#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
            batch = await dbContext.MedicineBatches.AsNoTracking()
                .FirstOrDefaultAsync(
                    b => b.MedicineId == medicineId && b.BranchId == session.BranchId && !b.IsDisposed
                        && b.BatchNo.ToUpper() == batchNo,
                    cancellationToken)
                .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862
        }

        if (batch is not null)
        {
            if (batch.IsDisposed)
            {
                throw new CustomException(
                    $"Batch {batch.BatchNo} has been written off and can not be counted.",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            var existing = lines.FirstOrDefault(l => l.BatchId == batch.Id);
            if (existing is not null)
            {
                return existing;
            }

            await EnsureNotInAnotherOpenCountAsync(session, batch.Id, cancellationToken).ConfigureAwait(false);
        }

        var medicine = await dbContext.Medicines.AsNoTracking()
            .Where(m => m.Id == medicineId)
            .Select(m => new { m.Name, m.Strength, m.CostPrice })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {medicineId} not found.");
        string name = string.Join(' ', new[] { medicine.Name, medicine.Strength }.Where(s => !string.IsNullOrWhiteSpace(s)));

        // A lot the system knows is snapshotted at its live quantity now; a new lot starts from zero.
        var line = batch is not null
            ? StockCountLine.Create(
                session.Id, medicineId, name, batch.Id, batch.BatchNo,
                StockCountLine.ExpiryOf(batch.ExpiryDate),
                entry.RackLocation ?? batch.RackLocation, batch.CostPrice, batch.QuantityOnHand, now, isFoundLot: true)
            : StockCountLine.Create(
                session.Id, medicineId, name, batchId: null, entry.BatchNo!, entry.ExpiryDate,
                entry.RackLocation ?? session.RackLocation, medicine.CostPrice, snapshotQuantity: 0m, now, isFoundLot: true);

        dbContext.StockCountLines.Add(line);
        lines.Add(line);
        return line;
    }

    private async Task EnsureNotInAnotherOpenCountAsync(StockCountSession session, Guid batchId, CancellationToken cancellationToken)
    {
        string? other = await (
            from line in dbContext.StockCountLines.AsNoTracking()
            join s in dbContext.StockCountSessions.AsNoTracking() on line.SessionId equals s.Id
            where s.Id != session.Id && line.BatchId == batchId
                && (s.Status == StockCountStatus.Counting || s.Status == StockCountStatus.Review)
            select s.SessionNumber)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        if (other is not null)
        {
            throw new CustomException(
                $"That lot is already being counted in {other}.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}
