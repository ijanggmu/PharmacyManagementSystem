using System.Data;
using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Adds received stock to lots, and takes a voided receipt's stock back out of them.
///
/// Concurrency: a lot that already exists is locked (<c>SELECT ... FOR UPDATE</c>) and re-read before it is
/// topped up or drawn down, so a sale deducting the same lot at the same moment is never overwritten by a
/// stale in-memory quantity. The lock is held until the transaction ends.
///
/// Transactions: with <see cref="StockReceiptRequest.JoinCallerTransaction"/> the caller has already opened a
/// transaction on the scope's shared connection (Purchasing does, so the stock and its receipt commit
/// together); the writes run inside it and EF's automatic transaction is switched off so it does not try to
/// open a nested one. Otherwise the receipt is its own unit of work: an open transaction on this context is
/// used as is, else one is opened and committed here.
/// </summary>
public sealed class StockReceiptService(InventoryDbContext dbContext, ICurrentBranch currentBranch) : IStockReceiptService
{
    public async ValueTask<IReadOnlyList<StockReceiptLineResult>> ReceiveAsync(
        StockReceiptRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Resolved ONCE per receipt so every line/batch created by this call is attributed to the
        // same branch — the caller's current branch, never client input (docs/branch-scoping-plan.md).
        Guid branchId = request.BranchId ?? await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        return await RunInTransactionAsync(
            request.JoinCallerTransaction,
            () => ReceiveWithinTransactionAsync(request, branchId, cancellationToken),
            cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<IReadOnlyList<StockReceiptReversalLineResult>> ReverseReceiptAsync(
        StockReceiptReversalRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        return await RunInTransactionAsync(
            request.JoinCallerTransaction,
            () => ReverseWithinTransactionAsync(request, cancellationToken),
            cancellationToken).ConfigureAwait(false);
    }

    private async Task<T> RunInTransactionAsync<T>(bool joinCallerTransaction, Func<Task<T>> work, CancellationToken cancellationToken)
    {
        if (!dbContext.Database.IsRelational())
        {
            return await work().ConfigureAwait(false);
        }

        if (joinCallerTransaction)
        {
            var previous = dbContext.Database.AutoTransactionBehavior;
            dbContext.Database.AutoTransactionBehavior = AutoTransactionBehavior.Never;
            try
            {
                return await work().ConfigureAwait(false);
            }
            finally
            {
                dbContext.Database.AutoTransactionBehavior = previous;
            }
        }

        if (dbContext.Database.CurrentTransaction is not null)
        {
            return await work().ConfigureAwait(false);
        }

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);
        var result = await work().ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    private async Task<IReadOnlyList<StockReceiptLineResult>> ReceiveWithinTransactionAsync(
        StockReceiptRequest request, Guid branchId, CancellationToken cancellationToken)
    {
        var results = new List<StockReceiptLineResult>();

        foreach (var line in request.Lines)
        {
            // Legacy defaults (medicine-service.ts insertMedicineBatchRow): a blank batch number is
            // generated, and a missing expiry is stored as "no expiry" rather than rejected.
            string batchNo = MedicineBatch.NormalizeBatchNo(
                string.IsNullOrWhiteSpace(line.BatchNo) ? NewAutoBatchNumber() : line.BatchNo);
            DateOnly expiryDate = line.ExpiryDate ?? MedicineBatch.NoExpiryDate;

            var existingBatch = await FindLiveBatchForUpdateAsync(line.MedicineId, branchId, batchNo, cancellationToken)
                .ConfigureAwait(false);

            // One lot has one expiry. A known batch number arriving with a different expiry is a typo
            // or a different lot; merging it would hide the new expiry behind the old one.
            if (existingBatch is not null && line.ExpiryDate is { } receivedExpiry && receivedExpiry != existingBatch.ExpiryDate)
            {
                throw new CustomException(
                    string.Format(
                        CultureInfo.InvariantCulture,
                        "Batch {0} already exists with expiry {1}, but this receipt says {2}. Check the batch number or the expiry date.",
                        existingBatch.BatchNo, FormatExpiry(existingBatch.ExpiryDate), FormatExpiry(receivedExpiry)),
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            MedicineBatch batch;
            if (existingBatch is null)
            {
                batch = MedicineBatch.Create(
                    line.MedicineId, branchId, batchNo, expiryDate, line.Quantity,
                    line.CostPrice, line.SellingPrice, line.RackLocation);
                dbContext.MedicineBatches.Add(batch);
            }
            else
            {
                existingBatch.Increase(line.Quantity);
                batch = existingBatch;
            }

            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                line.MedicineId, branchId, batch.Id, InventoryTransactionType.Purchase, line.Quantity, line.CostPrice,
                request.ReferenceType, request.ReferenceId));

            results.Add(new StockReceiptLineResult(line.MedicineId, batch.Id, batch.BatchNo, line.Quantity));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return results;
    }

    /// <summary>
    /// The live lot with this batch number at this branch, locked and re-read so its quantity is the
    /// committed one. A lot added earlier in this same request (not saved yet) is returned as is.
    /// </summary>
    private async Task<MedicineBatch?> FindLiveBatchForUpdateAsync(
        Guid medicineId, Guid branchId, string batchNo, CancellationToken cancellationToken)
    {
        // Same lot twice in one receipt: the first line created it, the second tops it up.
        var pending = dbContext.MedicineBatches.Local.FirstOrDefault(b =>
            b.MedicineId == medicineId && b.BranchId == branchId && !b.IsDisposed
            && string.Equals(b.BatchNo, batchNo, StringComparison.OrdinalIgnoreCase)
            && dbContext.Entry(b).State == EntityState.Added);
        if (pending is not null)
        {
            return pending;
        }

        // Matched on BranchId too — the same batch number received at a different branch is a
        // distinct physical lot, not the same row to increment. Case-insensitive so lots stored
        // before batch numbers were normalized still match.
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
        Guid? existingId = await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => b.MedicineId == medicineId && b.BatchNo.ToUpper() == batchNo
                && b.BranchId == branchId && !b.IsDisposed)
            .Select(b => (Guid?)b.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862

        if (existingId is not { } id)
        {
            return null;
        }

        var locked = await LockAndLoadAsync([id], cancellationToken).ConfigureAwait(false);
        return locked.FirstOrDefault(b => b.BranchId == branchId && !b.IsDisposed);
    }

    private async Task<IReadOnlyList<StockReceiptReversalLineResult>> ReverseWithinTransactionAsync(
        StockReceiptReversalRequest request, CancellationToken cancellationToken)
    {
        Guid branchId = request.BranchId;

        // Lots the original receipt put stock into, per medicine, with how much it put in each — used for
        // lines that don't name their lot (receipts recorded before lot ids were kept on the receipt).
        var originalLots = await LoadOriginalLotsAsync(request, cancellationToken).ConfigureAwait(false);

        // Work out, per line, which lot(s) the quantity must come out of. A null lot = oldest-expiring
        // first, only when nothing at all is known about where the receipt's stock went.
        var plan = new List<(Guid MedicineId, Guid? BatchId, decimal Quantity)>();
        foreach (var line in request.Lines.Where(l => l.Quantity > 0))
        {
            if (line.BatchId is { } batchId)
            {
                plan.Add((line.MedicineId, batchId, line.Quantity));
                continue;
            }

            if (originalLots.TryGetValue(line.MedicineId, out var lots) && lots.Count > 0)
            {
                decimal remaining = line.Quantity;
                for (int i = 0; i < lots.Count && remaining > 0; i++)
                {
                    decimal take = Math.Min(remaining, lots[i].Quantity);
                    if (take <= 0)
                    {
                        continue;
                    }

                    plan.Add((line.MedicineId, lots[i].BatchId, take));
                    lots[i] = (lots[i].BatchId, lots[i].Quantity - take);
                    remaining -= take;
                }

                // More on the line than the receipt's transactions show: the rest comes from the last lot,
                // where the availability check below decides whether it is there.
                if (remaining > 0)
                {
                    plan.Add((line.MedicineId, lots[^1].BatchId, remaining));
                }

                continue;
            }

            plan.Add((line.MedicineId, null, line.Quantity));
        }

        if (plan.Count == 0)
        {
            return [];
        }

        var pinnedIds = plan.Where(p => p.BatchId is not null).Select(p => p.BatchId!.Value).Distinct().ToArray();
        var fefoMedicineIds = plan.Where(p => p.BatchId is null).Select(p => p.MedicineId).Distinct().ToArray();

        // Candidate ids through LINQ (tenant filter applies), then lock exactly those rows.
        var candidateIds = await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => pinnedIds.Contains(b.Id)
                || (fefoMedicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed && b.QuantityOnHand > 0))
            .Select(b => b.Id)
            .ToArrayAsync(cancellationToken)
            .ConfigureAwait(false);

        var batches = (await LockAndLoadAsync(candidateIds, cancellationToken).ConfigureAwait(false))
            .ToDictionary(b => b.Id);

        // Availability is checked for EVERY line before ANY lot moves.
        var problems = new List<string>();
        foreach (var pinned in plan.Where(p => p.BatchId is not null).GroupBy(p => (p.MedicineId, BatchId: p.BatchId!.Value)))
        {
            decimal requested = pinned.Sum(p => p.Quantity);
            batches.TryGetValue(pinned.Key.BatchId, out var batch);
            bool usable = batch is not null && !batch.IsDisposed && batch.BranchId == branchId && batch.MedicineId == pinned.Key.MedicineId;
            decimal available = usable ? batch!.QuantityOnHand : 0m;
            if (available < requested)
            {
                problems.Add(string.Format(
                    CultureInfo.InvariantCulture,
                    "Batch {0} now holds {1:0.##}, but {2:0.##} received on this document must come back out of it (it has been sold, moved or written off since).",
                    batch?.BatchNo ?? pinned.Key.BatchId.ToString(), available, requested));
            }
        }

        foreach (var fefo in plan.Where(p => p.BatchId is null).GroupBy(p => p.MedicineId))
        {
            decimal requested = fefo.Sum(p => p.Quantity);
            decimal available = FefoLots(batches.Values, fefo.Key, branchId, pinnedIds).Sum(b => b.QuantityOnHand);
            if (available < requested)
            {
                problems.Add(string.Format(
                    CultureInfo.InvariantCulture,
                    "Medicine {0} has {1:0.##} in stock at this branch, but {2:0.##} received on this document must come back out.",
                    fefo.Key, available, requested));
            }
        }

        if (problems.Count > 0)
        {
            throw new CustomException(
                "This receipt's stock is no longer all on hand, so it can't be reversed. Return the goods to the supplier instead, or adjust stock first.",
                problems, HttpStatusCode.Conflict);
        }

        var used = new Dictionary<Guid, List<BatchDeductionDetail>>();
        foreach (var step in plan)
        {
            List<MedicineBatch> targets = step.BatchId is { } id
                ? [batches[id]]
                : FefoLots(batches.Values, step.MedicineId, branchId, pinnedIds);

            decimal remaining = step.Quantity;
            foreach (var batch in targets)
            {
                if (remaining <= 0)
                {
                    break;
                }

                decimal take = Math.Min(remaining, batch.QuantityOnHand);
                if (take <= 0)
                {
                    continue;
                }

                batch.Deduct(take);
                remaining -= take;

                dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                    step.MedicineId, branchId, batch.Id, InventoryTransactionType.PurchaseReversal, -take, batch.CostPrice,
                    request.ReferenceType, request.ReferenceId, "Goods receipt voided"));

                if (!used.TryGetValue(step.MedicineId, out var details))
                {
                    details = [];
                    used[step.MedicineId] = details;
                }

                details.Add(new BatchDeductionDetail(batch.Id, batch.BatchNo, take, batch.CostPrice));
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return used.Select(kv => new StockReceiptReversalLineResult(kv.Key, kv.Value)).ToList();
    }

    private static List<MedicineBatch> FefoLots(IEnumerable<MedicineBatch> batches, Guid medicineId, Guid branchId, Guid[] excluded) =>
        batches
            .Where(b => b.MedicineId == medicineId && b.BranchId == branchId && !b.IsDisposed && !excluded.Contains(b.Id))
            .OrderBy(b => b.ExpiryDate).ThenBy(b => b.CreatedAtUtc).ThenBy(b => b.Id)
            .ToList();

    private async Task<Dictionary<Guid, List<(Guid BatchId, decimal Quantity)>>> LoadOriginalLotsAsync(
        StockReceiptReversalRequest request, CancellationToken cancellationToken)
    {
        if (request.OriginalReferenceType is not { } referenceType
            || request.OriginalReferenceId is not { } referenceId
            || request.Lines.All(l => l.BatchId is not null))
        {
            return [];
        }

        var rows = await dbContext.InventoryTransactions
            .AsNoTracking()
            .Where(t => t.ReferenceType == referenceType && t.ReferenceId == referenceId
                && t.Type == InventoryTransactionType.Purchase && t.MedicineBatchId != null
                && t.BranchId == request.BranchId && t.QuantityDelta > 0)
            .OrderBy(t => t.CreatedAtUtc)
            .Select(t => new { t.MedicineId, BatchId = t.MedicineBatchId!.Value, t.QuantityDelta })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .GroupBy(r => r.MedicineId)
            .ToDictionary(
                g => g.Key,
                g => g.GroupBy(r => r.BatchId).Select(b => (b.Key, b.Sum(r => r.QuantityDelta))).ToList());
    }

    /// <summary>
    /// Locks the given lots (relational providers) and returns them as tracked entities carrying the
    /// committed, post-lock values. Lots this context already tracks unchanged are re-read; ones it has
    /// pending changes on are left alone (those changes are the caller's).
    /// </summary>
    private async Task<List<MedicineBatch>> LockAndLoadAsync(Guid[] ids, CancellationToken cancellationToken)
    {
        if (ids.Length == 0)
        {
            return [];
        }

        Guid[] lockedIds = ids;
        if (dbContext.Database.IsRelational())
        {
            // Ordered by id so two receipts locking the same lots always take them in the same order.
            // The table is written schema-qualified (HasDefaultSchema "inventory").
            lockedIds = await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM inventory."MedicineBatches"
                WHERE "Id" = ANY({ids})
                ORDER BY "Id"
                FOR UPDATE
                """).ToArrayAsync(cancellationToken).ConfigureAwait(false);

            foreach (var entry in dbContext.ChangeTracker.Entries<MedicineBatch>()
                         .Where(e => e.State == EntityState.Unchanged && lockedIds.Contains(e.Entity.Id))
                         .ToList())
            {
                entry.State = EntityState.Detached;
            }
        }

        return await dbContext.MedicineBatches
            .Where(b => lockedIds.Contains(b.Id))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    private static string FormatExpiry(DateOnly expiry) =>
        expiry == MedicineBatch.NoExpiryDate ? "none" : expiry.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>
    /// Legacy batch number format: <c>AUTO-{Date.now()}-{Math.random().toString(36).slice(2, 8)}</c>.
    /// Used when a receipt line has no batch number, so every such receipt gets its own lot.
    /// </summary>
    public static string NewAutoBatchNumber()
    {
        const string base36 = "0123456789abcdefghijklmnopqrstuvwxyz";
        Span<char> suffix = stackalloc char[6];
        for (int i = 0; i < suffix.Length; i++)
        {
            suffix[i] = base36[System.Security.Cryptography.RandomNumberGenerator.GetInt32(base36.Length)];
        }

        return $"AUTO-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{new string(suffix)}";
    }
}
