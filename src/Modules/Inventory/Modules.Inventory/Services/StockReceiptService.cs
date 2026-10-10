using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

public sealed class StockReceiptService(InventoryDbContext dbContext, ICurrentBranch currentBranch) : IStockReceiptService
{
    public async ValueTask<IReadOnlyList<StockReceiptLineResult>> ReceiveAsync(
        StockReceiptRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Resolved ONCE per receipt so every line/batch created by this call is attributed to the
        // same branch — the caller's current branch, never client input (docs/branch-scoping-plan.md).
        Guid branchId = request.BranchId ?? await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var results = new List<StockReceiptLineResult>();

        foreach (var line in request.Lines)
        {
            // Legacy defaults (medicine-service.ts insertMedicineBatchRow): a blank batch number is
            // generated, and a missing expiry is stored as "no expiry" rather than rejected.
            string batchNo = string.IsNullOrWhiteSpace(line.BatchNo) ? NewAutoBatchNumber() : line.BatchNo.Trim();
            DateOnly expiryDate = line.ExpiryDate ?? MedicineBatch.NoExpiryDate;

            // Matched on BranchId too — the same batch number received at a different branch is a
            // distinct physical lot, not the same row to increment.
            var existingBatch = await dbContext.MedicineBatches
                .FirstOrDefaultAsync(
                    b => b.MedicineId == line.MedicineId && b.BatchNo == batchNo
                        && b.BranchId == branchId && !b.IsDisposed,
                    cancellationToken)
                .ConfigureAwait(false);

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
