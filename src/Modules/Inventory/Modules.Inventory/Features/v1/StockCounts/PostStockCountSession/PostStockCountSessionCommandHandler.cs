using System.Data;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.PostStockCountSession;

/// <summary>
/// Review → Posted, in ONE transaction: every counted lot is locked (one id-ordered lock call), its variance
/// is worked out against the movements since its snapshot (<see cref="StockCountVariance"/> — sales made
/// while counting are not losses) and applied ON TOP of the live quantity through the same adjustment path as
/// a single-lot correction (<see cref="BatchAdjustmentWriter"/>: an Adjustment movement at lot cost, referenced
/// to this count). The books get one stock-gain and one stock-loss posting for the whole count
/// (<see cref="InventoryAdjustmentPublisher"/> → InventoryAdjustedIntegrationEvent, written to the outbox in
/// this transaction); consigned lots move stock but post nothing, as with any adjustment.
///
/// A found lot the system did not know is created (zero, then adjusted up to the count) at the medicine's
/// cost. Uncounted lines are left untouched. A lot written off since the snapshot is skipped.
/// </summary>
public sealed class PostStockCountSessionCommandHandler(
    InventoryDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider)
    : ICommandHandler<PostStockCountSessionCommand, StockCountSessionDto>
{
    public const string ReferenceType = "StockCount";

    public async ValueTask<StockCountSessionDto> Handle(PostStockCountSessionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var session = await StockCountStore.LockSessionAsync(dbContext, currentBranch, command.SessionId, cancellationToken)
            .ConfigureAwait(false);
        if (session.Status != StockCountStatus.Review)
        {
            throw new CustomException(
                $"Stock count {session.SessionNumber} is {session.Status}; submit it for review before posting.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var lines = await dbContext.StockCountLines
            .Where(l => l.SessionId == session.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var counted = lines.Where(l => l.CountedQuantity is not null).ToList();

        string narration = $"Stock count {session.SessionNumber}";
        var newLots = await ResolveUnknownLotsAsync(session, counted, cancellationToken).ConfigureAwait(false);

        var existingIds = counted.Where(l => l.BatchId is not null && !newLots.ContainsKey(l.Id))
            .Select(l => l.BatchId!.Value).Distinct().ToList();
        var locked = (await InventoryRowLocks.LockBatchesAsync(dbContext, existingIds, cancellationToken).ConfigureAwait(false))
            .ToDictionary(b => b.Id);
        var movements = counted.Count == 0
            ? []
            : await StockCountStore.LoadMovementsAsync(
                dbContext, existingIds, counted.Min(l => l.SnapshotAtUtc), excludeReferenceId: session.Id, cancellationToken)
                .ConfigureAwait(false);
        var consigned = await ConsignedStock.ConsignedAmongAsync(dbContext, existingIds, cancellationToken).ConfigureAwait(false);

        decimal gain = 0m;
        decimal loss = 0m;
        foreach (var line in counted)
        {
            if (!newLots.TryGetValue(line.Id, out MedicineBatch? batch)
                && (line.BatchId is not { } id || !locked.TryGetValue(id, out batch)))
            {
                continue;
            }

            decimal expected = StockCountVariance.ExpectedAtCount(
                line.SnapshotQuantity, line.SnapshotAtUtc, line.CountedAtUtc!.Value,
                movements.TryGetValue(batch.Id, out var lotMovements) ? lotMovements : []);

            if (batch.IsDisposed)
            {
                line.MarkPosted(batch.Id, expected, 0m);
                continue;
            }

            decimal variance = StockCountVariance.Variance(line.CountedQuantity!.Value, expected);
            decimal newQuantity = StockCountVariance.QuantityAfterPosting(batch.QuantityOnHand, variance);
            decimal delta = BatchAdjustmentWriter.Apply(dbContext, batch, newQuantity, narration, ReferenceType, session.Id);
            line.MarkPosted(batch.Id, expected, delta);

            if (consigned.Contains(batch.Id))
            {
                continue;
            }

            decimal value = Math.Round(delta * batch.CostPrice, 2, MidpointRounding.AwayFromZero);
            if (value > 0)
            {
                gain += value;
            }
            else
            {
                loss -= value;
            }
        }

        session.MarkPosted(timeProvider.GetUtcNow().UtcDateTime, currentUser.GetUserId(), gain, loss);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // Gains and losses go to the books separately so the voucher shows both sides of the count.
        await InventoryAdjustmentPublisher.PublishAsync(
            outbox, currentUser, gain, $"{narration}: stock gain", session.BranchId, cancellationToken).ConfigureAwait(false);
        await InventoryAdjustmentPublisher.PublishAsync(
            outbox, currentUser, -loss, $"{narration}: stock loss", session.BranchId, cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);

        return StockCountMapper.ToDto(session, lines.Count, counted.Count);
    }

    /// <summary>
    /// Found lots recorded without a system lot: linked to a live lot of that number when one exists by now
    /// (it is then locked with the others), else created empty here so the count's gain is booked on it.
    /// Returns the created lots by line id.
    /// </summary>
    private async Task<Dictionary<Guid, MedicineBatch>> ResolveUnknownLotsAsync(
        StockCountSession session, List<StockCountLine> counted, CancellationToken cancellationToken)
    {
        var created = new Dictionary<Guid, MedicineBatch>();
        foreach (var line in counted.Where(l => l.BatchId is null))
        {
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
            var existing = await dbContext.MedicineBatches.AsNoTracking()
                .Where(b => b.MedicineId == line.MedicineId && b.BranchId == session.BranchId && !b.IsDisposed
                    && b.BatchNo.ToUpper() == line.BatchNo)
                .Select(b => (Guid?)b.Id)
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862
            if (existing is { } batchId)
            {
                line.LinkBatch(batchId);
                continue;
            }

            var medicine = await dbContext.Medicines.AsNoTracking()
                .Where(m => m.Id == line.MedicineId)
                .Select(m => new { m.UnitPrice, m.IsTaxable })
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false)
                ?? throw new NotFoundException($"Medicine {line.MedicineId} of found lot {line.BatchNo} not found.");

            var batch = MedicineBatch.Create(
                line.MedicineId, session.BranchId, line.BatchNo, line.ExpiryDate ?? MedicineBatch.NoExpiryDate,
                quantity: 0m, line.UnitCost, medicine.UnitPrice, line.RackLocation, medicine.IsTaxable);
            dbContext.MedicineBatches.Add(batch);
            created[line.Id] = batch;
        }

        return created;
    }
}
