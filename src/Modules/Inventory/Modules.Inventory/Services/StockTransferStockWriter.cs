using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Writes the batch-level stock for a transfer leg. Receive credits the destination branch and cancel
/// credits the source branch: each <see cref="StockTransferBatch"/> allocation is added back as a live
/// batch with the same batch number, expiry, and cost, increasing an existing live batch at that branch
/// when one exists. Callers save the context and own the transaction.
/// </summary>
internal static class StockTransferStockWriter
{
    public static async Task RestockAsync(
        InventoryDbContext dbContext, Guid branchId, Guid transferId,
        IReadOnlyList<StockTransferBatch> allocations, string notes, CancellationToken cancellationToken = default)
    {
        if (allocations.Count == 0)
        {
            return;
        }

        var liveBatches = await LockLiveBatchesToIncreaseAsync(dbContext, branchId, allocations, cancellationToken)
            .ConfigureAwait(false);

        // Live rows are unique per (medicine, branch, batch no), so this key is one-to-one.
        var byKey = liveBatches.ToDictionary(b => (b.MedicineId, b.BatchNo));

        foreach (var allocation in allocations)
        {
            var key = (allocation.MedicineId, allocation.BatchNo);
            if (!byKey.TryGetValue(key, out var batch))
            {
                batch = MedicineBatch.Create(
                    allocation.MedicineId, branchId, allocation.BatchNo, allocation.ExpiryDate,
                    allocation.Quantity, allocation.CostPrice, allocation.SellingPrice, rackLocation: null);
                dbContext.MedicineBatches.Add(batch);
                byKey[key] = batch;
            }
            else
            {
                batch.Increase(allocation.Quantity);
            }

            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                allocation.MedicineId, branchId, batch.Id, InventoryTransactionType.Transfer, allocation.Quantity,
                allocation.CostPrice, referenceType: "StockTransfer", referenceId: transferId, notes: notes));
        }
    }

    /// <summary>
    /// Loads the live batches at <paramref name="branchId"/> that match an allocation's (medicine, batch no).
    /// On relational providers the matching rows are locked with <c>SELECT ... FOR UPDATE</c> (same approach as
    /// <c>StockDeductionService</c>) and then loaded tracked, so the quantity increase is applied to the
    /// committed value and concurrent stock movements cannot lose it. The lock is held until the caller's
    /// transaction ends. InMemory providers cannot express row locks and get the plain tracked read.
    /// </summary>
    private static async Task<List<MedicineBatch>> LockLiveBatchesToIncreaseAsync(
        InventoryDbContext dbContext, Guid branchId, IReadOnlyList<StockTransferBatch> allocations,
        CancellationToken cancellationToken)
    {
        var medicineIds = allocations.Select(a => a.MedicineId).Distinct().ToList();

        if (!dbContext.Database.IsRelational())
        {
            return await dbContext.MedicineBatches
                .Where(b => b.BranchId == branchId && !b.IsDisposed && medicineIds.Contains(b.MedicineId))
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);
        }

        // Step 1: candidate ids through the normal LINQ path, so the tenant filter applies, narrowed to the
        // exact (medicine, batch no) keys the transfer will increase.
        var candidates = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => b.BranchId == branchId && !b.IsDisposed && medicineIds.Contains(b.MedicineId))
            .Select(b => new { b.Id, b.MedicineId, b.BatchNo })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var keys = allocations.Select(a => (a.MedicineId, a.BatchNo)).ToHashSet();
        var candidateIds = candidates
            .Where(c => keys.Contains((c.MedicineId, c.BatchNo)))
            .Select(c => c.Id)
            .ToArray();

        if (candidateIds.Length == 0)
        {
            return [];
        }

        // Step 2: lock exactly those rows. The branch and live predicates are repeated because the row may have
        // changed since step 1. ORDER BY keeps lock acquisition order stable across concurrent transfers.
        var lockedIds = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM inventory."MedicineBatches"
            WHERE "Id" = ANY({candidateIds}) AND "BranchId" = {branchId} AND NOT "IsDisposed"
            ORDER BY "Id"
            FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);

        if (lockedIds.Length == 0)
        {
            return [];
        }

        // Step 3: load the locked rows as tracked entities; the lock is held, so this returns committed values.
        return await dbContext.MedicineBatches
            .Where(b => lockedIds.Contains(b.Id))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
