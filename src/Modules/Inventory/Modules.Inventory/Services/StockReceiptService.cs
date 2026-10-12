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
/// Adds received stock. With <see cref="StockReceiptRequest.JoinCallerTransaction"/> the receipt runs inside
/// the transaction the caller opened on the scope's shared connection (Purchasing receiving an order), so the
/// stock and the caller's own writes commit or roll back together: Npgsql runs every command on a connection
/// inside its current transaction, and EF's own transaction is switched off for the save so it doesn't try to
/// open a nested one. Otherwise the receipt commits on its own as before.
/// </summary>
public sealed class StockReceiptService(InventoryDbContext dbContext, ICurrentBranch currentBranch) : IStockReceiptService
{
    /// <summary>The medicine's default selling price — what a new batch is priced at when nothing else is given.</summary>
    internal static Task<decimal> DefaultSellingPriceAsync(InventoryDbContext dbContext, Guid medicineId, CancellationToken cancellationToken) =>
        dbContext.Medicines.AsNoTracking()
            .Where(m => m.Id == medicineId)
            .Select(m => m.UnitPrice)
            .FirstOrDefaultAsync(cancellationToken);

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
            string batchNo = MedicineBatch.NormalizeBatchNo(
                string.IsNullOrWhiteSpace(line.BatchNo) ? NewAutoBatchNumber() : line.BatchNo);
            DateOnly expiryDate = line.ExpiryDate ?? MedicineBatch.NoExpiryDate;

            // Matched on BranchId too — the same batch number received at a different branch is a
            // distinct physical lot, not the same row to increment. Case-insensitive so lots stored
            // before batch numbers were normalized still match.
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
            var existingBatch = await dbContext.MedicineBatches
                .FirstOrDefaultAsync(
                    b => b.MedicineId == line.MedicineId && b.BatchNo.ToUpper() == batchNo
                        && b.BranchId == branchId && !b.IsDisposed,
                    cancellationToken)
                .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862

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
                // The batch price is the only price a sale charges, so a new lot never starts at 0: when
                // the receipt carries no selling price it takes the medicine's default price.
                decimal sellingPrice = line.SellingPrice > 0m
                    ? line.SellingPrice
                    : await DefaultSellingPriceAsync(dbContext, line.MedicineId, cancellationToken).ConfigureAwait(false);
                batch = MedicineBatch.Create(
                    line.MedicineId, branchId, batchNo, expiryDate, line.Quantity,
                    line.CostPrice, sellingPrice, line.RackLocation);
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

        if (!request.JoinCallerTransaction || !dbContext.Database.IsRelational())
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return results;
        }

        var previous = dbContext.Database.AutoTransactionBehavior;
        dbContext.Database.AutoTransactionBehavior = AutoTransactionBehavior.Never;
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            dbContext.Database.AutoTransactionBehavior = previous;
        }

        return results;
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
