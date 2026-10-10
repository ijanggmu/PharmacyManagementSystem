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

        if (joinCallerTransaction)
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
        var batchesByMedicine = (await LockAndLoadCandidateBatchesAsync(medicineIds, branchId, excludeRecalled, cancellationToken)
                .ConfigureAwait(false))
            .GroupBy(b => b.MedicineId)
            .ToDictionary(g => g.Key, g => g.ToList());

        // Availability is checked across ALL lines before ANY batch is mutated (§4.4) — a
        // multi-item sale never partially deducts before failing. The check is per MEDICINE, summed
        // over its lines: two lines of the same medicine draw from the same batches, so checking each
        // line against the untouched quantities would let the second line silently under-deduct.
        var requestedByMedicine = request.Lines
            .GroupBy(l => l.MedicineId)
            .ToDictionary(g => g.Key, g => g.Sum(l => l.Quantity));

        var shortfalls = new List<StockShortfall>();
        foreach (var (medicineId, requested) in requestedByMedicine)
        {
            decimal available = batchesByMedicine.TryGetValue(medicineId, out var batches)
                ? batches.Sum(b => b.QuantityOnHand)
                : 0m;
            if (available < requested)
            {
                shortfalls.Add(new StockShortfall(medicineId, requested, available));
            }
        }

        if (shortfalls.Count > 0)
        {
            throw new InsufficientStockException(shortfalls);
        }

        var results = new List<StockDeductionLineResult>();
        foreach (var line in request.Lines)
        {
            var batches = batchesByMedicine.TryGetValue(line.MedicineId, out var found) ? found : [];
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

                used.Add(new BatchDeductionDetail(batch.Id, batch.BatchNo, take, batch.CostPrice));
            }

            results.Add(new StockDeductionLineResult(line.MedicineId, line.Quantity, used));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return results;
    }

    /// <summary>
    /// Returns the live, FEFO-ordered, branch-scoped candidate batches. On relational providers their
    /// row locks are held until the caller's transaction ends.
    /// </summary>
    private async Task<List<MedicineBatch>> LockAndLoadCandidateBatchesAsync(
        Guid[] medicineIds, Guid branchId, bool excludeRecalled, CancellationToken cancellationToken)
    {
        if (!dbContext.Database.IsRelational())
        {
            // Non-relational providers (InMemory unit tests) cannot express FOR UPDATE. They get the
            // same branch/live filter and FEFO order without the lock.
            return await dbContext.MedicineBatches
                .Where(b => medicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed && b.QuantityOnHand > 0
                    && (!excludeRecalled || !b.IsRecalled))
                .OrderByFefo()
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);
        }

        // Step 1: candidate ids through the normal LINQ path, so the tenant filter applies.
        var candidateIds = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => medicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed && b.QuantityOnHand > 0
                && (!excludeRecalled || !b.IsRecalled))
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
            && (!excludeRecalled || !b.IsRecalled)).ToList();
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
        string referenceType, Guid referenceId, IReadOnlyList<StockDeductionLineResult> originalDeduction,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(originalDeduction);

        // Same branch as the original deduction would have used — the caller's current branch.
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        foreach (var line in originalDeduction)
        {
            // Restock into a single new "cancellation" batch dated today rather than trying to
            // reverse into the original batches, which may have moved on since the sale
            // (root plan §12's explicit "not a raw undo" guidance).
            decimal totalQuantity = line.Batches.Sum(b => b.QuantityDeducted);
            if (totalQuantity <= 0) continue;

            decimal weightedCost = line.Batches.Sum(b => b.QuantityDeducted * b.UnitCostPrice) / totalQuantity;

            var batch = MedicineBatch.Create(
                line.MedicineId, branchId, $"CANCEL-{referenceId:N}",
                today, totalQuantity, weightedCost, weightedCost, rackLocation: null);

            dbContext.MedicineBatches.Add(batch);
            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                line.MedicineId, branchId, batch.Id, InventoryTransactionType.SaleReversal, totalQuantity, weightedCost,
                referenceType, referenceId, "Restocked from sale cancellation"));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
