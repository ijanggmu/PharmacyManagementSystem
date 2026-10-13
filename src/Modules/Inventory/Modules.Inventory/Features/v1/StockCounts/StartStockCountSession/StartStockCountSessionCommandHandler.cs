using System.Data;
using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.StartStockCountSession;

/// <summary>
/// Draft → Counting. Snapshots every in-scope lot of the session's branch that has stock: live (not
/// disposed) lots of non-deleted medicines, narrowed by the session's category / rack / preferred supplier.
///
/// The lots are locked (<c>FOR UPDATE</c>) before the snapshot instant is taken and their quantities read.
/// A sale already holding one of them finishes first and is inside the snapshot; any later movement waits
/// for this transaction and so is stamped after the snapshot instant — which is what the variance roll-forward
/// (<see cref="StockCountVariance"/>) relies on to count every movement exactly once.
///
/// A lot can be in only one open (Counting / Review) count at a time: two overlapping counts would each apply
/// their variance to the same lot when posted.
/// </summary>
public sealed class StartStockCountSessionCommandHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider)
    : ICommandHandler<StartStockCountSessionCommand, Guid>
{
    public async ValueTask<Guid> Handle(StartStockCountSessionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var session = await StockCountStore.LockSessionAsync(dbContext, currentBranch, command.SessionId, cancellationToken)
            .ConfigureAwait(false);
        if (session.Status != StockCountStatus.Draft)
        {
            throw new CustomException(
                $"Stock count {session.SessionNumber} has already been started.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var scoped =
            from b in dbContext.MedicineBatches.AsNoTracking()
            join m in dbContext.Medicines.AsNoTracking() on b.MedicineId equals m.Id
            where b.BranchId == session.BranchId && !b.IsDisposed && b.QuantityOnHand > 0
            select new { Batch = b, Medicine = m };

        if (session.CategoryId is { } categoryId)
        {
            scoped = scoped.Where(x => x.Medicine.CategoryId == categoryId);
        }

        if (session.SupplierId is { } supplierId)
        {
            scoped = scoped.Where(x => x.Medicine.SupplierId == supplierId);
        }

        if (session.RackLocation is { } rack)
        {
            string rackUpper = rack.ToUpperInvariant();
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
            scoped = scoped.Where(x => x.Batch.RackLocation != null && x.Batch.RackLocation.ToUpper() == rackUpper);
#pragma warning restore CA1304, CA1311, CA1862
        }

        var candidates = await scoped
            .Select(x => new
            {
                x.Batch.Id,
                x.Medicine.Name,
                x.Medicine.Strength,
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (candidates.Count == 0)
        {
            throw new CustomException(
                "No lots with stock match this count's scope.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var candidateIds = candidates.Select(c => c.Id).ToList();
        await EnsureNotInAnotherOpenCountAsync(session, candidateIds, cancellationToken).ConfigureAwait(false);

        var batches = await InventoryRowLocks.LockBatchesAsync(dbContext, candidateIds, cancellationToken).ConfigureAwait(false);
        DateTime snapshotAt = timeProvider.GetUtcNow().UtcDateTime;
        var names = candidates.ToDictionary(c => c.Id, c => string.Join(' ', new[] { c.Name, c.Strength }.Where(s => !string.IsNullOrWhiteSpace(s))));

        foreach (var batch in batches.Where(b => !b.IsDisposed && b.QuantityOnHand > 0).OrderBy(b => b.RackLocation).ThenBy(b => names[b.Id]))
        {
            dbContext.StockCountLines.Add(StockCountLine.Create(
                session.Id, batch.MedicineId, names[batch.Id], batch.Id, batch.BatchNo,
                StockCountLine.ExpiryOf(batch.ExpiryDate),
                batch.RackLocation, batch.CostPrice, batch.QuantityOnHand, snapshotAt, isFoundLot: false));
        }

        session.Start(snapshotAt);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return session.Id;
    }

    private async Task EnsureNotInAnotherOpenCountAsync(
        StockCountSession session, List<Guid> batchIds, CancellationToken cancellationToken)
    {
        Guid?[] ids = batchIds.Select(id => (Guid?)id).ToArray();
        var clash = await (
            from line in dbContext.StockCountLines.AsNoTracking()
            join other in dbContext.StockCountSessions.AsNoTracking() on line.SessionId equals other.Id
            where other.Id != session.Id
                && other.BranchId == session.BranchId
                && (other.Status == StockCountStatus.Counting || other.Status == StockCountStatus.Review)
                && ids.Contains(line.BatchId)
            select new { other.SessionNumber })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        if (clash is not null)
        {
            throw new CustomException(
                string.Create(CultureInfo.InvariantCulture,
                    $"Some of these lots are already being counted in {clash.SessionNumber}. Post or cancel it first, or narrow this count's scope."),
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}
