using System.Data;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// FEFO stock deduction. Concurrency: candidate batches are locked with <c>SELECT ... FOR UPDATE</c>,
/// then re-read after the lock and deducted against those quantities, so two concurrent sales of the
/// same last unit serialize instead of both succeeding.
///
/// Transactions: a sale's deduction runs inside the Sales transaction already open on the scope's
/// shared connection. Npgsql runs every command on a connection inside its current transaction, so
/// these writes commit or roll back with the sale row and the outbox event. EF's automatic transaction
/// is switched off for the call so EF does not try to open a nested one. A supplier-return deduction
/// has no caller transaction and opens and commits its own.
/// </summary>
public sealed class StockDeductionService(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch) : IStockDeductionService
{
    public ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForSaleAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default) =>
        DeductAsync(request, InventoryTransactionType.Sale, joinCallerTransaction: true, cancellationToken);

    public ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForTransferAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default) =>
        DeductAsync(request, InventoryTransactionType.Transfer, joinCallerTransaction: true, cancellationToken);

    public ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForSupplierReturnAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default) =>
        DeductAsync(request, InventoryTransactionType.SupplierReturn, joinCallerTransaction: false, cancellationToken);

    private async ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductAsync(
        StockDeductionRequest request, InventoryTransactionType transactionType, bool joinCallerTransaction,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Resolved ONCE per deduction so every line/batch mutated by this call is attributed to the
        // same branch — the caller's current branch, never client input (docs/branch-scoping-plan.md).
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var medicineIds = request.Lines.Select(l => l.MedicineId).Distinct().ToArray();

        DetachStaleTrackedState();

        if (!dbContext.Database.IsRelational())
        {
            return await DeductWithinTransactionAsync(request, transactionType, branchId, medicineIds, cancellationToken)
                .ConfigureAwait(false);
        }

        if (joinCallerTransaction || request.JoinCallerTransaction)
        {
            var previous = dbContext.Database.AutoTransactionBehavior;
            dbContext.Database.AutoTransactionBehavior = AutoTransactionBehavior.Never;
            try
            {
                return await DeductWithinTransactionAsync(request, transactionType, branchId, medicineIds, cancellationToken)
                    .ConfigureAwait(false);
            }
            finally
            {
                dbContext.Database.AutoTransactionBehavior = previous;
            }
        }

        // Standalone: the caller has no transaction of its own, so this deduction is the unit of work.
        // If this context already has one open, that one is used and left for its owner to commit.
        if (dbContext.Database.CurrentTransaction is not null)
        {
            return await DeductWithinTransactionAsync(request, transactionType, branchId, medicineIds, cancellationToken)
                .ConfigureAwait(false);
        }

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);
        var standaloneResults = await DeductWithinTransactionAsync(
            request, transactionType, branchId, medicineIds, cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return standaloneResults;
    }

    private async ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductWithinTransactionAsync(
        StockDeductionRequest request, InventoryTransactionType transactionType, Guid branchId,
        Guid[] medicineIds, CancellationToken cancellationToken)
    {
        // Lock, then re-read. Every candidate batch for every requested medicine is locked before any
        // quantity is checked, and the quantities used below are the post-lock values.
        // Recalled lots are never sold or moved as saleable stock. A supplier return is the remedy for a recall,
        // so it may still draw from them.
        bool excludeRecalled = transactionType != InventoryTransactionType.SupplierReturn;
        // Expired lots are never sold. FEFO puts them first, so without this a sale would hand out
        // expired stock ahead of good stock. Transfers and supplier returns may still move them.
        DateOnly? sellableOn = transactionType == InventoryTransactionType.Sale
            ? DateOnly.FromDateTime(DateTime.UtcNow)
            : null;
        var batchesByMedicine = (await LockAndLoadCandidateBatchesAsync(medicineIds, branchId, excludeRecalled, sellableOn, cancellationToken)
                .ConfigureAwait(false))
            .GroupBy(b => b.MedicineId)
            .ToDictionary(g => g.Key, g => g.ToList());

        // Availability is checked across ALL lines before ANY batch is mutated (§4.4) — a
        // multi-item sale never partially deducts before failing. A line naming a batch must be covered by
        // that batch; the other lines are checked per MEDICINE, summed over its lines (two lines of the same
        // medicine draw from the same batches, so checking each line against the untouched quantities would
        // let the second silently under-deduct), against what the named-batch lines leave.
        var shortfalls = new List<StockShortfall>();
        var takenFromNamedBatches = new Dictionary<Guid, decimal>();
        foreach (var group in request.Lines.Where(l => l.BatchId is not null).GroupBy(l => (l.MedicineId, BatchId: l.BatchId!.Value)))
        {
            decimal requested = group.Sum(l => l.Quantity);
            var batch = batchesByMedicine.TryGetValue(group.Key.MedicineId, out var candidates)
                ? candidates.FirstOrDefault(b => b.Id == group.Key.BatchId)
                : null;
            decimal available = batch?.QuantityOnHand ?? 0m;
            if (available < requested)
            {
                shortfalls.Add(new StockShortfall(group.Key.MedicineId, requested, available));
            }

            takenFromNamedBatches[group.Key.MedicineId] = takenFromNamedBatches.GetValueOrDefault(group.Key.MedicineId) + requested;
        }

        foreach (var group in request.Lines.Where(l => l.BatchId is null).GroupBy(l => l.MedicineId))
        {
            decimal requested = group.Sum(l => l.Quantity);
            decimal available = (batchesByMedicine.TryGetValue(group.Key, out var batches) ? batches.Sum(b => b.QuantityOnHand) : 0m)
                - takenFromNamedBatches.GetValueOrDefault(group.Key);
            if (available < requested)
            {
                shortfalls.Add(new StockShortfall(group.Key, requested, Math.Max(0m, available)));
            }
        }

        if (shortfalls.Count > 0)
        {
            throw new InsufficientStockException(shortfalls);
        }

        // Named-batch lines first, so FEFO lines can't drain the batch a named line needs. Results stay in
        // request order: callers match them to their lines by position.
        var results = new StockDeductionLineResult[request.Lines.Count];
        var order = Enumerable.Range(0, request.Lines.Count).OrderBy(i => request.Lines[i].BatchId is null ? 1 : 0);
        foreach (int index in order)
        {
            var line = request.Lines[index];
            List<MedicineBatch> batches = batchesByMedicine.TryGetValue(line.MedicineId, out var found) ? found : [];
            if (line.BatchId is { } namedBatch)
            {
                batches = batches.Where(b => b.Id == namedBatch).ToList();
            }
            decimal remaining = line.Quantity;
            var used = new List<BatchDeductionDetail>();

            foreach (var batch in batches)
            {
                if (remaining <= 0) break;
                // Drained by an earlier line of this same request.
                if (batch.QuantityOnHand <= 0) continue;

                decimal take = Math.Min(remaining, batch.QuantityOnHand);
                batch.Deduct(take);
                remaining -= take;

                dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                    line.MedicineId, branchId, batch.Id, transactionType, -take, batch.CostPrice,
                    request.ReferenceType, request.ReferenceId));

                used.Add(new BatchDeductionDetail(batch.Id, batch.BatchNo, take, batch.CostPrice, batch.SellingPrice));
            }

            results[index] = new StockDeductionLineResult(line.MedicineId, line.Quantity, used);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return results;
    }

    /// <summary>
    /// Returns the live, FEFO-ordered, branch-scoped candidate batches. On relational providers their
    /// row locks are held until the caller's transaction ends.
    /// </summary>
    private async Task<List<MedicineBatch>> LockAndLoadCandidateBatchesAsync(
        Guid[] medicineIds, Guid branchId, bool excludeRecalled, DateOnly? sellableOn, CancellationToken cancellationToken)
    {
        // DateOnly.MinValue keeps every lot when there is no expiry cut-off.
        DateOnly minExpiry = sellableOn ?? DateOnly.MinValue;

        if (!dbContext.Database.IsRelational())
        {
            // Non-relational providers (InMemory unit tests) cannot express FOR UPDATE. They get the
            // same branch/live filter and FEFO order without the lock.
            return await dbContext.MedicineBatches
                .Where(b => medicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed && b.QuantityOnHand > 0
                    && (!excludeRecalled || !b.IsRecalled) && b.ExpiryDate >= minExpiry)
                .OrderByFefo()
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);
        }

        // Step 1: candidate ids through the normal LINQ path, so the tenant filter applies.
        var candidateIds = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => medicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed && b.QuantityOnHand > 0
                && (!excludeRecalled || !b.IsRecalled) && b.ExpiryDate >= minExpiry)
            .OrderByFefo()
            .Select(b => b.Id)
            .ToArrayAsync(cancellationToken)
            .ConfigureAwait(false);

        if (candidateIds.Length == 0)
        {
            return [];
        }

        // Step 2: lock exactly those rows. The branch and live-state predicates are repeated here
        // because the row may have changed since step 1. ORDER BY keeps lock acquisition in FEFO order
        // across concurrent sales. The table is written schema-qualified (HasDefaultSchema "inventory").
        var lockedIds = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM inventory."MedicineBatches"
            WHERE "Id" = ANY({candidateIds}) AND "BranchId" = {branchId}
              AND NOT "IsDisposed" AND "QuantityOnHand" > 0
              AND ({excludeRecalled} = FALSE OR NOT "IsRecalled")
              AND "ExpiryDate" >= {minExpiry}
            ORDER BY "ExpiryDate", "CreatedAtUtc", "Id"
            FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);

        if (lockedIds.Length == 0)
        {
            return [];
        }

        // Step 3: load the locked rows as tracked entities. The lock is already held, so READ COMMITTED
        // returns the committed post-lock quantities.
        var rows = await dbContext.MedicineBatches
            .Where(b => lockedIds.Contains(b.Id))
            .OrderByFefo()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Where(b => b.BranchId == branchId && !b.IsDisposed && b.QuantityOnHand > 0
            && (!excludeRecalled || !b.IsRecalled) && b.ExpiryDate >= minExpiry).ToList();
    }

    /// <summary>
    /// Drops batch and transaction entities still tracked from an earlier attempt. After a rollback
    /// (Sales retries once on a deadlock) their in-memory quantities are stale, and un-saved
    /// <see cref="InventoryTransaction"/>s would be re-inserted by the next SaveChanges. Detaching
    /// makes the post-lock read return database values.
    /// </summary>
    private void DetachStaleTrackedState()
    {
        foreach (var entry in dbContext.ChangeTracker.Entries()
                     .Where(e => e.Entity is MedicineBatch or InventoryTransaction)
                     .ToList())
        {
            entry.State = EntityState.Detached;
        }
    }

    public async ValueTask RestockFromCancellationAsync(
        string referenceType, Guid referenceId, Guid branchId, IReadOnlyList<StockDeductionLineResult> originalDeduction,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(originalDeduction);

        // Idempotent: the triggering integration event can be redelivered (the inbox mark commits separately
        // from this handler), and a second restock would put the same units back twice.
        bool alreadyRestocked = await dbContext.InventoryTransactions.AsNoTracking()
            .AnyAsync(t => t.ReferenceType == referenceType && t.ReferenceId == referenceId
                && t.Type == InventoryTransactionType.SaleReversal, cancellationToken)
            .ConfigureAwait(false);
        if (alreadyRestocked)
        {
            return;
        }

        var details = originalDeduction
            .SelectMany(l => l.Batches.Select(b => (l.MedicineId, Batch: b)))
            .Where(x => x.Batch.QuantityDeducted > 0)
            .ToList();

        var knownBatchIds = details.Where(x => x.Batch.BatchId != Guid.Empty).Select(x => x.Batch.BatchId).Distinct().ToArray();
        var originals = await dbContext.MedicineBatches
            .Where(b => knownBatchIds.Contains(b.Id))
            .ToDictionaryAsync(b => b.Id, cancellationToken)
            .ConfigureAwait(false);

        var medicineIds = details.Select(x => x.MedicineId).Distinct().ToArray();
        var medicinePrices = await dbContext.Medicines.AsNoTracking()
            .Where(m => medicineIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.UnitPrice, cancellationToken)
            .ConfigureAwait(false);

        var leftovers = new List<(Guid MedicineId, BatchDeductionDetail Detail, MedicineBatch? Original)>();
        foreach (var (medicineId, detail) in details)
        {
            // Back into the lot it was sold from: same expiry, same price, and a recalled lot stays
            // recalled, so a returned recalled unit can't be sold again.
            if (originals.TryGetValue(detail.BatchId, out var original) && !original.IsDisposed && original.BranchId == branchId)
            {
                original.Increase(detail.QuantityDeducted);
                dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                    medicineId, branchId, original.Id, InventoryTransactionType.SaleReversal, detail.QuantityDeducted, original.CostPrice,
                    referenceType, referenceId, "Restocked into its original batch"));
                continue;
            }

            leftovers.Add((medicineId, detail, original));
        }

        // Units whose lot can't take them back (unknown, disposed, or at another branch) go into one replacement
        // batch per medicine — so two such lines never collide on (MedicineId, BranchId, BatchNo) — at their
        // weighted cost. It keeps the earliest expiry of the lots they came from; lines sold before sales tracked
        // batches have no lot, so today's date stands. The price is the lot's, else the medicine's, never the cost.
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        foreach (var group in leftovers.GroupBy(x => x.MedicineId))
        {
            decimal quantity = group.Sum(x => x.Detail.QuantityDeducted);
            decimal weightedCost = group.Sum(x => x.Detail.QuantityDeducted * x.Detail.UnitCostPrice) / quantity;
            var lots = group.Where(x => x.Original is not null).Select(x => x.Original!).ToList();
            DateOnly expiry = lots.Count > 0 ? lots.Min(b => b.ExpiryDate) : today;
            decimal sellingPrice = lots.FirstOrDefault(b => b.SellingPrice > 0m)?.SellingPrice
                ?? medicinePrices.GetValueOrDefault(group.Key);

            var replacement = MedicineBatch.Create(
                group.Key, branchId, $"{(referenceType == "Sale" ? "CANCEL" : "RETURN")}-{referenceId:N}",
                expiry, quantity, weightedCost, sellingPrice, rackLocation: lots.FirstOrDefault()?.RackLocation);
            dbContext.MedicineBatches.Add(replacement);
            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                group.Key, branchId, replacement.Id, InventoryTransactionType.SaleReversal, quantity, weightedCost,
                referenceType, referenceId, "Restocked into a replacement batch"));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
