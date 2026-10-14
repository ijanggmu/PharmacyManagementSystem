using System.Data;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// FEFO stock deduction. Concurrency: candidate batches are locked with <c>SELECT ... FOR UPDATE</c>,
/// then re-read after the lock and deducted against those quantities, so two concurrent sales of the
/// same last unit serialize instead of both succeeding. All of a deduction's lots are locked in one
/// statement in id order (the order every multi-lot lock in this module uses), and the FEFO order is
/// applied in memory afterwards, so a sale never deadlocks with a receipt, restock or transfer.
///
/// Expiry: a sale or a transfer never draws from a lot that expired before today's Nepal date
/// (<see cref="NepalClock"/>) — availability is checked against the same filtered set. A supplier
/// return may still draw from expired (and recalled) lots: sending them back is the remedy.
///
/// Transactions: a sale's deduction runs inside the Sales transaction already open on the scope's
/// shared connection. Npgsql runs every command on a connection inside its current transaction, so
/// these writes commit or roll back with the sale row and the outbox event. EF's automatic transaction
/// is switched off for the call so EF does not try to open a nested one. A supplier-return deduction
/// has no caller transaction and opens and commits its own.
/// </summary>
public sealed class StockDeductionService(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    TimeProvider? timeProvider = null) : IStockDeductionService
{
    private const string RestockBatchPrefix = "RESTOCK-";

    private readonly TimeProvider _clock = timeProvider ?? TimeProvider.System;

    public ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForSaleAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default) =>
        DeductAsync(request, InventoryTransactionType.Sale, joinCallerTransaction: true, cancellationToken);

    public ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForTransferAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default) =>
        DeductAsync(request, InventoryTransactionType.Transfer, joinCallerTransaction: true, cancellationToken);

    public ValueTask<IReadOnlyList<StockDeductionLineResult>> DeductForSupplierReturnAsync(
        StockDeductionRequest request, CancellationToken cancellationToken = default) =>
        DeductAsync(request, InventoryTransactionType.SupplierReturn, joinCallerTransaction: true, cancellationToken);

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
        // Recalled and expired lots are never sold or moved as saleable stock. A supplier return is the
        // remedy for both, so it may still draw from them.
        bool saleableOnly = transactionType != InventoryTransactionType.SupplierReturn;
        // A transfer moves only stock the pharmacy owns: consignment lots belong to the supplier until sold and
        // are settled from this branch's sales, so they never leave it.
        bool ownedOnly = transactionType == InventoryTransactionType.Transfer;
        var filter = new CandidateFilter(branchId, saleableOnly, NepalClock.Today(_clock), ownedOnly);
        var batchesByMedicine = (await LockAndLoadCandidateBatchesAsync(medicineIds, filter, cancellationToken)
                .ConfigureAwait(false))
            .GroupBy(b => b.MedicineId)
            .ToDictionary(g => g.Key, g => g.ToList());

        if (transactionType == InventoryTransactionType.SupplierReturn)
        {
            await ExcludeConsignedLotsAsync(request, batchesByMedicine, cancellationToken).ConfigureAwait(false);
        }

        // Availability is checked across ALL lines before ANY batch is mutated (§4.4) — a
        // multi-item sale never partially deducts before failing. The check is per MEDICINE, summed
        // over its lines: two lines of the same medicine draw from the same batches, so checking each
        // line against the untouched quantities would let the second line silently under-deduct.
        var requestedByMedicine = request.Lines
            .GroupBy(l => l.MedicineId)
            .ToDictionary(g => g.Key, g => g.Sum(l => l.Quantity));

        var shortfalls = new List<StockShortfall>();

        // A line pinned to a batch needs that batch to hold its quantity (summed across pinned lines).
        foreach (var pinned in request.Lines.Where(l => l.BatchId is not null).GroupBy(l => (l.MedicineId, BatchId: l.BatchId!.Value)))
        {
            decimal requestedFromBatch = pinned.Sum(l => l.Quantity);
            var batch = batchesByMedicine.TryGetValue(pinned.Key.MedicineId, out var candidates)
                ? candidates.FirstOrDefault(b => b.Id == pinned.Key.BatchId)
                : null;
            if (batch is null || batch.QuantityOnHand < requestedFromBatch)
            {
                shortfalls.Add(new StockShortfall(pinned.Key.MedicineId, requestedFromBatch, batch?.QuantityOnHand ?? 0m));
            }
        }

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

        // Results come back in the caller's line order (callers pair result[i] with their own line i —
        // a supplier return's debit note does), even though pinned lines are deducted first so FEFO
        // lines don't drain a batch someone asked for by name.
        var results = new StockDeductionLineResult[request.Lines.Count];
        var processingOrder = request.Lines
            .Select((line, index) => (Line: line, Index: index))
            .OrderBy(x => x.Line.BatchId is null);

        foreach (var (line, index) in processingOrder)
        {
            var batches = batchesByMedicine.TryGetValue(line.MedicineId, out var found) ? found : [];
            if (line.BatchId is { } pinnedBatchId)
            {
                batches = batches.Where(b => b.Id == pinnedBatchId).ToList();
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

                used.Add(new BatchDeductionDetail(batch.Id, batch.BatchNo, take, batch.CostPrice, batch.SellingPrice, batch.IsTaxable));
            }

            results[index] = new StockDeductionLineResult(line.MedicineId, line.Quantity, used);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return results;
    }

    /// <summary>
    /// A supplier return is a debit note against stock the pharmacy OWNS: it credits Inventory, reverses
    /// input VAT and reduces the payable. Consigned lots were never booked into Inventory, never claimed
    /// input VAT and aren't payable until settled, so they never go on one: oldest-expiring-first skips
    /// them, and a line naming one is refused (409). The lock already taken on them is harmless.
    /// </summary>
    private async Task ExcludeConsignedLotsAsync(
        StockDeductionRequest request, Dictionary<Guid, List<MedicineBatch>> batchesByMedicine,
        CancellationToken cancellationToken)
    {
        var candidateIds = batchesByMedicine.Values.SelectMany(b => b).Select(b => b.Id)
            .Concat(request.Lines.Where(l => l.BatchId is not null).Select(l => l.BatchId!.Value))
            .Distinct()
            .ToList();
        var consigned = await ConsignedStock.ConsignedAmongAsync(dbContext, candidateIds, cancellationToken).ConfigureAwait(false);
        if (consigned.Count == 0)
        {
            return;
        }

        var pinnedConsigned = request.Lines.FirstOrDefault(l => l.BatchId is { } id && consigned.Contains(id));
        if (pinnedConsigned is not null)
        {
            string batchNo = batchesByMedicine.Values.SelectMany(b => b)
                .FirstOrDefault(b => b.Id == pinnedConsigned.BatchId)?.BatchNo ?? pinnedConsigned.BatchId!.Value.ToString();
            throw new CustomException(
                $"Batch {batchNo} is consignment stock — the supplier still owns it, so it can't go on a debit note. Send it back by adjusting or disposing the lot (no stock loss is posted for consigned stock); only units sold are ever settled.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        foreach (var lots in batchesByMedicine.Values)
        {
            lots.RemoveAll(b => consigned.Contains(b.Id));
        }
    }

    /// <summary>Which lots a deduction may draw from: this branch's live lots, and — for a sale or
    /// transfer — only those not recalled and not expired as of <see cref="Today"/>.</summary>
    private readonly record struct CandidateFilter(Guid BranchId, bool SaleableOnly, DateOnly Today, bool OwnedOnly = false)
    {
        public bool Matches(MedicineBatch batch) =>
            batch.BranchId == BranchId && !batch.IsDisposed && batch.QuantityOnHand > 0
            && (!SaleableOnly || (!batch.IsRecalled && FefoBatchOrdering.IsSellableOn(batch.ExpiryDate, Today)));
    }

    /// <summary>
    /// Returns the live, FEFO-ordered, branch-scoped candidate batches. On relational providers their
    /// row locks are held until the caller's transaction ends.
    /// </summary>
    private async Task<List<MedicineBatch>> LockAndLoadCandidateBatchesAsync(
        Guid[] medicineIds, CandidateFilter filter, CancellationToken cancellationToken)
    {
        Guid branchId = filter.BranchId;
        bool saleableOnly = filter.SaleableOnly;
        DateOnly today = filter.Today;
        bool ownedOnly = filter.OwnedOnly;

        // Step 1: candidate ids through the normal LINQ path, so the tenant filter applies.
        var candidates = dbContext.MedicineBatches
            .Where(b => medicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed && b.QuantityOnHand > 0
                && (!saleableOnly || (!b.IsRecalled && b.ExpiryDate >= today))
                && (!ownedOnly || !dbContext.ConsignmentPositions.Any(p => p.BatchId == b.Id)));

        if (!dbContext.Database.IsRelational())
        {
            // Non-relational providers (InMemory unit tests) cannot express FOR UPDATE. They get the
            // same branch/live/expiry filter and FEFO order without the lock.
            return await candidates.OrderByFefo().ToListAsync(cancellationToken).ConfigureAwait(false);
        }

        var candidateIds = await candidates.AsNoTracking()
            .Select(b => b.Id)
            .ToArrayAsync(cancellationToken)
            .ConfigureAwait(false);

        if (candidateIds.Length == 0)
        {
            return [];
        }

        // Step 2: lock exactly those rows, every candidate of every requested medicine in ONE statement and
        // in id order — the order every multi-lot lock in this module takes (receipts, restocks, transfers,
        // InventoryRowLocks). Two flows locking overlapping lots then queue on the lowest shared id instead
        // of each holding a lot the other wants; locking in FEFO order here (expiry first) while the others
        // locked by id is what let a sale and a receipt deadlock. FEFO order is applied in memory in step 3.
        // The branch, live-state and expiry predicates are repeated because the row may have changed since
        // step 1. The table is written schema-qualified (HasDefaultSchema "inventory").
        var lockedIds = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM inventory."MedicineBatches"
            WHERE "Id" = ANY({candidateIds}) AND "BranchId" = {branchId}
              AND NOT "IsDisposed" AND "QuantityOnHand" > 0
              AND ({saleableOnly} = FALSE OR (NOT "IsRecalled" AND "ExpiryDate" >= {today}))
            ORDER BY "Id"
            FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);

        if (lockedIds.Length == 0)
        {
            return [];
        }

        // Step 3: load the locked rows as tracked entities. The lock is already held, so READ COMMITTED
        // returns the committed post-lock quantities. FEFO order is applied here, in memory.
        var rows = await dbContext.MedicineBatches
            .Where(b => lockedIds.Contains(b.Id))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Where(filter.Matches).OrderByFefo().ThenBy(b => b.Id).ToList();
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

    public ValueTask RestockFromCancellationAsync(
        string referenceType, Guid referenceId, IReadOnlyList<StockDeductionLineResult> originalDeduction,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(originalDeduction);

        var lines = originalDeduction
            .Select(line =>
            {
                decimal quantity = line.Batches.Sum(b => b.QuantityDeducted);
                decimal unitCost = quantity == 0 ? 0m : line.Batches.Sum(b => b.QuantityDeducted * b.UnitCostPrice) / quantity;
                return new StockRestockLine(line.MedicineId, quantity, unitCost);
            })
            .ToList();

        return RestockAsync(
            new StockRestockRequest(referenceType, referenceId, referenceType, referenceId, BranchId: null, lines,
                "Restocked from sale cancellation"),
            cancellationToken);
    }

    public async ValueTask RestockAsync(StockRestockRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var lines = request.Lines.Where(l => l.Quantity > 0).ToList();
        if (lines.Count == 0)
        {
            return;
        }

        DetachStaleTrackedState();

        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            await RestockWithinTransactionAsync(request, lines, cancellationToken).ConfigureAwait(false);
            return;
        }

        // Background (outbox) callers have no transaction: the lot locks, the quantity increases and the
        // ledger rows commit together.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);
        await RestockWithinTransactionAsync(request, lines, cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task RestockWithinTransactionAsync(
        StockRestockRequest request, List<StockRestockLine> lines, CancellationToken cancellationToken)
    {
        // A redelivered event must not restock twice.
        bool alreadyRestocked = await dbContext.InventoryTransactions
            .AnyAsync(
                t => t.Type == InventoryTransactionType.SaleReversal
                    && t.ReferenceType == request.ReferenceType && t.ReferenceId == request.ReferenceId,
                cancellationToken)
            .ConfigureAwait(false);
        if (alreadyRestocked)
        {
            return;
        }

        var medicineIds = lines.Select(l => l.MedicineId).Distinct().ToArray();

        // The original sale's draws, lot by lot, in the order it took them.
        var originalDraws = await dbContext.InventoryTransactions.AsNoTracking()
            .Where(t => t.ReferenceType == request.OriginalReferenceType && t.ReferenceId == request.OriginalReferenceId
                && t.Type == InventoryTransactionType.Sale && t.QuantityDelta < 0 && t.MedicineBatchId != null
                && medicineIds.Contains(t.MedicineId))
            .OrderBy(t => t.CreatedAtUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // The branch comes from the event (the dispatcher has no current branch); for older events
        // without one, from the sale's own deduction; only then from the ambient branch.
        Guid branchId = request.BranchId
            ?? originalDraws.Select(t => (Guid?)t.BranchId).FirstOrDefault()
            ?? await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        originalDraws = originalDraws.Where(t => t.BranchId == branchId).ToList();

        // What earlier restocks of the same original sale (an earlier partial return, or the cancellation
        // itself) already put back, per original lot. A second partial return only fills what is left of
        // each lot's draw, so it does not pile into the first lot while a later lot never gets its stock.
        var alreadyCredited = await LoadEarlierCreditsAsync(request, medicineIds, cancellationToken).ConfigureAwait(false);

        // Every lot this restock might write is locked up front, in ONE id-ordered statement: the lots the
        // sale drew from, plus every live lot of these medicines at this branch (a re-opened lot's live
        // twin, the earliest sellable lot for unplaced stock, an earlier restock lot). Locking them one at a
        // time as they were needed took them in a different order than a sale locks them — a deadlock.
        var liveIds = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => medicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed)
            .Select(b => b.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var lockIds = originalDraws.Select(t => t.MedicineBatchId!.Value).Concat(liveIds).Distinct().ToList();
        var locked = await InventoryRowLocks.LockBatchesAsync(dbContext, lockIds, cancellationToken).ConfigureAwait(false);
        var originalBatches = locked.ToDictionary(b => b.Id);

        var inheritance = await LotInheritance.LoadAsync(dbContext, medicineIds, cancellationToken).ConfigureAwait(false);
        var writer = new RestockWriter(dbContext, branchId, request, locked, inheritance);

        foreach (var medicineLines in lines.GroupBy(l => l.MedicineId))
        {
            Guid medicineId = medicineLines.Key;
            decimal remaining = medicineLines.Sum(l => l.Quantity);
            decimal lineCost = medicineLines.Sum(l => l.Quantity * l.UnitCostPrice) / remaining;

            // Per original lot, how much the sale took from it (two draws on one lot are summed), less what
            // earlier restocks of the same sale already returned to it.
            var draws = originalDraws
                .Where(t => t.MedicineId == medicineId)
                .GroupBy(t => t.MedicineBatchId!.Value)
                .Select(g => (BatchId: g.Key,
                    Open: -g.Sum(t => t.QuantityDelta) - alreadyCredited.GetValueOrDefault(g.Key)))
                .ToList();

            foreach (var (batchId, open) in draws)
            {
                if (remaining <= 0) break;
                if (open <= 0) continue;
                if (!originalBatches.TryGetValue(batchId, out var original)) continue;

                decimal quantity = Math.Min(remaining, open);
                var target = original.IsDisposed || original.BranchId != branchId
                    ? writer.FindOrReopen(original)
                    : original;
                writer.Credit(target, quantity, original);
                remaining -= quantity;
            }

            if (remaining > 0)
            {
                // Stock the sale's own ledger can't place (an event from before lots were recorded, a lot that
                // no longer exists, or more than the sale's draws still owe): the earliest sellable lot of the
                // medicine at this branch.
                writer.CreditUnplaced(medicineId, remaining, lineCost, NepalClock.Today(_clock));
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Quantity earlier restocks of <paramref name="request"/>'s original document already put back, keyed by
    /// the ORIGINAL lot it was drawn from. Credits recorded with their original reference count against the
    /// source lot they recorded (stock that could not be placed back records none and counts against no lot).
    /// Older credits whose own reference is the original document (a cancellation) count against the lot
    /// they wrote to.
    /// </summary>
    private async Task<Dictionary<Guid, decimal>> LoadEarlierCreditsAsync(
        StockRestockRequest request, Guid[] medicineIds, CancellationToken cancellationToken)
    {
        var credits = await dbContext.InventoryTransactions.AsNoTracking()
            .Where(t => t.Type == InventoryTransactionType.SaleReversal && t.QuantityDelta > 0
                && medicineIds.Contains(t.MedicineId)
                && ((t.OriginalReferenceType == request.OriginalReferenceType && t.OriginalReferenceId == request.OriginalReferenceId)
                    || (t.ReferenceType == request.OriginalReferenceType && t.ReferenceId == request.OriginalReferenceId)))
            .Select(t => new { LotId = t.OriginalReferenceId != null ? t.SourceBatchId : t.MedicineBatchId, t.QuantityDelta })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return credits
            .Where(c => c.LotId is not null)
            .GroupBy(c => c.LotId!.Value)
            .ToDictionary(g => g.Key, g => g.Sum(c => c.QuantityDelta));
    }

    /// <summary>
    /// Applies restock credits to lots the caller already locked (all of them, in one id-ordered lock),
    /// re-opening each disposed lot at most once per restock so two lines of the same lot never create two
    /// live rows with the same (medicine, branch, batch no). A lot that takes stock back sells at the
    /// medicine's current price and carries its batch's recall (<see cref="LotInheritance"/>).
    /// </summary>
    private sealed class RestockWriter(
        InventoryDbContext dbContext, Guid branchId, StockRestockRequest request,
        IReadOnlyList<MedicineBatch> lockedLots, LotInheritance inheritance)
    {
        private readonly Dictionary<(Guid MedicineId, string BatchNo), MedicineBatch> _byKey = [];

        public MedicineBatch FindOrReopen(MedicineBatch original)
        {
            string batchNo = MedicineBatch.NormalizeBatchNo(original.BatchNo);
            var live = FindLive(original.MedicineId, batchNo);
            if (live is not null)
            {
                return live;
            }

            // Same lot and expiry — only its row is new. Created empty; Credit adds the quantity, sets the
            // medicine's current price and carries the batch's recall over.
            var reopened = MedicineBatch.Create(
                original.MedicineId, branchId, batchNo, original.ExpiryDate, 0m,
                original.CostPrice, original.SellingPrice, original.RackLocation, original.IsTaxable);
            dbContext.MedicineBatches.Add(reopened);
            _byKey[(original.MedicineId, batchNo)] = reopened;
            return reopened;
        }

        public void CreditUnplaced(Guid medicineId, decimal quantity, decimal unitCost, DateOnly today)
        {
            var earliest = lockedLots
                .Where(b => b.MedicineId == medicineId && b.BranchId == branchId && !b.IsDisposed && !b.IsRecalled
                    && b.ExpiryDate >= today)
                .OrderByFefo()
                .ThenBy(b => b.Id)
                .FirstOrDefault();
            if (earliest is not null)
            {
                Credit(earliest, quantity, original: null);
                return;
            }

            // No lot to put it in: one restock lot per medicine. Its expiry is unknown, so it is stored as
            // "no expiry" — the same rule StockReceiptService applies to a receipt without an expiry.
            string batchNo = MedicineBatch.NormalizeBatchNo($"{RestockBatchPrefix}{request.ReferenceId:N}");
            var batch = FindLive(medicineId, batchNo);
            if (batch is null)
            {
                batch = MedicineBatch.Create(
                    medicineId, branchId, batchNo, MedicineBatch.NoExpiryDate, 0m, unitCost,
                    inheritance.CurrentUnitPrice(medicineId) ?? 0m, rackLocation: null, inheritance.IsTaxable(medicineId));
                dbContext.MedicineBatches.Add(batch);
                _byKey[(medicineId, batchNo)] = batch;
            }

            Credit(batch, quantity, original: null);
        }

        public void Credit(MedicineBatch target, decimal quantity, MedicineBatch? original)
        {
            target.Increase(quantity);
            inheritance.ApplyCurrentPrice(target);
            inheritance.ApplyRecall(dbContext, target);

            string notes = request.Notes ?? "Restocked";
            if (original is not null && original.Id != target.Id)
            {
                notes = $"{notes} (lot {original.BatchNo} re-opened)";
            }

            dbContext.InventoryTransactions.Add(InventoryTransaction.CreateRestockCredit(
                target.MedicineId, branchId, target.Id, quantity, target.CostPrice,
                request.ReferenceType, request.ReferenceId, request.OriginalReferenceType, request.OriginalReferenceId,
                sourceBatchId: original?.Id, notes));
        }

        private MedicineBatch? FindLive(Guid medicineId, string batchNo)
        {
            if (_byKey.TryGetValue((medicineId, batchNo), out var pending))
            {
                return pending;
            }

            var live = lockedLots.FirstOrDefault(b => b.MedicineId == medicineId && b.BranchId == branchId && !b.IsDisposed
                && MedicineBatch.NormalizeBatchNo(b.BatchNo) == batchNo);
            if (live is not null)
            {
                _byKey[(medicineId, batchNo)] = live;
            }

            return live;
        }
    }
}
