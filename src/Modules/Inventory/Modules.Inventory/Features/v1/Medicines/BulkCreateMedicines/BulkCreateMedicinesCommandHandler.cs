using System.Data;
using System.Globalization;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;

/// <summary>
/// Ported from POST app/api/medicines/bulk/route.ts + `bulkCreateMedicinesWithConsolidatedReceipts`
/// (lib/server/services/medicine-service.ts).
///
/// Each row goes through the same <see cref="Medicine.Create"/> call CreateMedicineCommandHandler uses,
/// plus an opening batch and ledger <see cref="InventoryTransaction"/> when the row carries stock. A row
/// with stock and a supplier posts the supplier payable through the same outbox publisher the single
/// create uses (<see cref="SupplierStockReceiptPublisher"/>). All rows are added to the change tracker
/// before one <c>SaveChangesAsync</c>, so a failure partway through leaves the database untouched.
///
/// Rows that share the same (<see cref="BulkMedicineRow.SupplierId"/>, <see
/// cref="BulkMedicineRow.SupplierInvoiceNumber"/>, <see cref="BulkMedicineRow.ReceiptDate"/>) are
/// grouped into one supplier bill with a line per medicine — the one-receipt-per-bill-group
/// consolidation from `bulkCreateMedicinesWithConsolidatedReceipts`; Purchasing records each bill as
/// a direct goods receipt. A supplier row with no invoice number is its own bill. Rows with stock and
/// no supplier are opening stock: their total value posts one opening-balance entry for the import.
///
/// Concurrency: the transaction is opened first and every existing lot the import tops up is locked
/// (one id-ordered <c>FOR UPDATE</c>, <see cref="InventoryRowLocks"/>) and re-read inside it, so a sale of
/// the same lot committed meanwhile is never overwritten by a stale quantity.
/// </summary>
public sealed class BulkCreateMedicinesCommandHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    IOutboxWriter outbox,
    ICurrentUser currentUser)
    : ICommandHandler<BulkCreateMedicinesCommand, BulkCreateMedicinesResult>
{
    public async ValueTask<BulkCreateMedicinesResult> Handle(
        BulkCreateMedicinesCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Opened before anything is read for writing: the existing lots this import tops up are locked
        // (FOR UPDATE) inside it and stay locked until the medicines, lots and events commit together.
        // Reading a lot first and locking (or not locking) it later let a sale committed in between be
        // overwritten by the import's stale quantity.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        // Pass 1: resolve each row's medicine (existing or new) and canonical batch number.
        // A row naming a medicine that already exists (same name + strength + form) adds its stock to
        // that medicine instead of creating a duplicate — in the database, or created by an earlier row.
        var importedByIdentity = new Dictionary<string, Guid>(StringComparer.Ordinal);
        var resolved = new List<(BulkMedicineRow Row, Guid MedicineId, bool Existing, string? BatchNo)>(command.Rows.Count);
        foreach (var row in command.Rows)
        {
            string identity = IdentityKey(row.Name, row.Strength, row.Form);
            Guid? existingId = importedByIdentity.TryGetValue(identity, out var importedId) ? importedId : null;
            if (existingId is null)
            {
                var duplicates = await MedicineIdentityGuard.FindDuplicatesAsync(
                    dbContext, row.Name, row.Strength, row.Form, excludeId: null, cancellationToken).ConfigureAwait(false);
                existingId = duplicates.Count > 0 ? duplicates[0].Id : null;
            }

            Guid medicineId = existingId ?? CreateMedicine(row);
            importedByIdentity.TryAdd(identity, medicineId);

            string? batchNo = row.Quantity > 0 ? BatchNumberOf(row) : null;
            resolved.Add((row, medicineId, existingId is not null, batchNo));
        }

        // Resolved once — only needed when at least one row carries opening stock.
        Guid? branchId = resolved.Any(r => r.BatchNo is not null)
            ? await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false)
            : null;

        // Every existing lot the import tops up, locked together in one id-ordered statement.
        var importBatches = branchId is { } lockBranch
            ? await LockExistingLotsAsync(resolved, lockBranch, cancellationToken).ConfigureAwait(false)
            : [];

        // A lot is bought under its medicine's VAT status: the stored one for a medicine that already
        // existed, the row's own for one this import creates.
        var existingIds = resolved.Where(r => r.Existing).Select(r => r.MedicineId).Distinct().ToList();
        var storedTaxable = existingIds.Count == 0
            ? []
            : await dbContext.Medicines.AsNoTracking()
                .Where(m => existingIds.Contains(m.Id))
                .Select(m => new { m.Id, m.IsTaxable })
                .ToDictionaryAsync(m => m.Id, m => m.IsTaxable, cancellationToken)
                .ConfigureAwait(false);

        // Rows sharing (SupplierId, SupplierInvoiceNumber, ReceiptDate) are consolidated into one
        // bill posted once after the loop. Keyed by the trimmed invoice number so whitespace
        // differences don't split a bill into two groups; a row without an invoice number gets its
        // own key.
        var bills = new Dictionary<(Guid SupplierId, string Key, DateOnly? Date), BillGroup>();
        decimal openingStockValue = 0m;
        var created = new List<BulkCreatedMedicine>(command.Rows.Count);

        // Pass 2: stock.
        foreach (var (row, medicineId, existing, batchNo) in resolved)
        {
            Guid? batchId = null;
            if (batchNo is not null && branchId is { } rowBranch)
            {
                bool isTaxable = dbContext.Medicines.Local.FirstOrDefault(m => m.Id == medicineId)?.IsTaxable
                    ?? storedTaxable.GetValueOrDefault(medicineId, row.IsTaxable);
                var batch = ReceiveBatch(medicineId, rowBranch, row, batchNo, isTaxable, importBatches);
                batchId = batch.Id;

                dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                    medicineId, rowBranch, batch.Id, InventoryTransactionType.Purchase, row.Quantity,
                    row.CostPrice, referenceType: "bulk_import"));

                if (row.SupplierId is Guid supplierId)
                {
                    string? invoice = string.IsNullOrWhiteSpace(row.SupplierInvoiceNumber)
                        ? null
                        : row.SupplierInvoiceNumber.Trim();
                    // A row without an invoice number is its own bill.
                    var key = (supplierId, invoice ?? Guid.CreateVersion7().ToString(), row.ReceiptDate);
                    if (!bills.TryGetValue(key, out var bill))
                    {
                        bill = new BillGroup(supplierId, invoice, row.ReceiptDate);
                        bills[key] = bill;
                    }

                    bill.Lines.Add(new SupplierStockReceiptLine(medicineId, row.Quantity, row.CostPrice, row.VatAmount));
                    bill.Payment ??= row.Payment;
                }
                else
                {
                    openingStockValue += row.Quantity * row.CostPrice;
                }
            }

            created.Add(new BulkCreatedMedicine(medicineId, batchId, AddedToExisting: existing));
        }

        // The medicines and the receipt/opening-stock events commit together: the outbox joins this
        // transaction, so a failed save never leaves a payable for medicines that don't exist.
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        foreach (var bill in bills.Values)
        {
            DateTime? receiptDateUtc = bill.ReceiptDate?.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            await SupplierStockReceiptPublisher.PublishBillAsync(
                outbox, currentUser, bill.SupplierId, bill.Lines, bill.Invoice, branchId, receiptDateUtc,
                cancellationToken, bill.Payment).ConfigureAwait(false);
        }

        await OpeningStockPublisher.PublishAsync(
            outbox, currentUser, openingStockValue, "Opening stock from bulk medicine import", branchId,
            cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return new BulkCreateMedicinesResult(created);
    }

    /// <summary>
    /// The live lots at this branch that rows of existing medicines name, locked in one id-ordered
    /// statement (<see cref="InventoryRowLocks"/>) and re-read, keyed by (medicine, canonical batch no).
    /// </summary>
    private async Task<Dictionary<(Guid MedicineId, string BatchNo), MedicineBatch>> LockExistingLotsAsync(
        List<(BulkMedicineRow Row, Guid MedicineId, bool Existing, string? BatchNo)> resolved, Guid branchId,
        CancellationToken cancellationToken)
    {
        var keys = resolved
            .Where(r => r.Existing && r.BatchNo is not null)
            .Select(r => (r.MedicineId, BatchNo: r.BatchNo!))
            .ToHashSet();
        if (keys.Count == 0)
        {
            return [];
        }

        var medicineIds = keys.Select(k => k.MedicineId).Distinct().ToArray();
        var candidates = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => medicineIds.Contains(b.MedicineId) && b.BranchId == branchId && !b.IsDisposed)
            .Select(b => new { b.Id, b.MedicineId, b.BatchNo })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var ids = candidates
            .Where(c => keys.Contains((c.MedicineId, MedicineBatch.NormalizeBatchNo(c.BatchNo))))
            .Select(c => c.Id)
            .ToList();

        var locked = await InventoryRowLocks.LockBatchesAsync(dbContext, ids, cancellationToken).ConfigureAwait(false);
        var byKey = new Dictionary<(Guid MedicineId, string BatchNo), MedicineBatch>();
        foreach (var lot in locked.Where(b => b.BranchId == branchId && !b.IsDisposed))
        {
            byKey.TryAdd((lot.MedicineId, MedicineBatch.NormalizeBatchNo(lot.BatchNo)), lot);
        }

        // Owned stock is never merged into a consigned lot (settlement bills that lot's sales to the supplier).
        Guid[] lotIds = byKey.Values.Select(b => b.Id).ToArray();
        var consigned = await dbContext.ConsignmentPositions.AsNoTracking()
            .Where(p => lotIds.Contains(p.BatchId))
            .Select(p => p.BatchNo)
            .Distinct()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (consigned.Count > 0)
        {
            throw new CustomException(
                $"Batch {string.Join(", ", consigned)} at this branch is consignment stock (owned by the supplier until sold). Stock you own can't be added to it — import it under a different batch number.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        return byKey;
    }

    /// <summary>The medicine lines of one supplier bill.</summary>
    private Guid CreateMedicine(BulkMedicineRow row)
    {
        var medicine = Medicine.Create(
            row.Name,
            row.GenericName,
            row.CategoryId,
            row.ReorderLevel,
            row.IsControlled,
            unitPrice: row.UnitPrice,
            costPrice: row.CostPrice,
            form: row.Form,
            strength: row.Strength,
            maximumStock: row.MaximumStock,
            prescriptionRequired: row.PrescriptionRequired,
            isTaxable: row.IsTaxable,
            supplierId: row.SupplierId,
            supplierInvoiceNumber: row.SupplierInvoiceNumber,
            vatAmount: row.VatAmount);
        dbContext.Medicines.Add(medicine);
        return medicine.Id;
    }

    /// <summary>
    /// The row's batch: an existing live lot with the same number at this branch (locked up front, or
    /// opened earlier in this import) is topped up when the expiry matches; otherwise a new lot opens.
    /// </summary>
    private MedicineBatch ReceiveBatch(
        Guid medicineId, Guid branchId, BulkMedicineRow row, string batchNo, bool isTaxable,
        Dictionary<(Guid MedicineId, string BatchNo), MedicineBatch> importBatches)
    {
        if (!importBatches.TryGetValue((medicineId, batchNo), out var batch))
        {
            batch = MedicineBatch.Create(
                // No expiry given: stored as "no expiry", the same rule StockReceiptService applies —
                // never a made-up date that would let the lot sell past its real expiry.
                medicineId, branchId, batchNo, row.ExpiryDate ?? MedicineBatch.NoExpiryDate,
                // No lot price on the row: the lot starts at the medicine's price, never at 0.
                row.Quantity, row.CostPrice, row.SellingPrice > 0m ? row.SellingPrice : row.UnitPrice, row.RackLocation,
                isTaxable);
            dbContext.MedicineBatches.Add(batch);
        }
        else if (row.ExpiryDate is { } expiry && expiry != batch.ExpiryDate)
        {
            throw new CustomException(
                string.Format(
                    CultureInfo.InvariantCulture,
                    "{0}: batch {1} already exists with expiry {2:yyyy-MM-dd}, but the import says {3:yyyy-MM-dd}. Check the batch number or the expiry date.",
                    row.Name, batch.BatchNo, batch.ExpiryDate, expiry),
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
        else
        {
            batch.Increase(row.Quantity);
            if (row.SellingPrice > 0)
            {
                batch.ChangeSellingPrice(row.SellingPrice);
            }
        }

        importBatches[(medicineId, batchNo)] = batch;
        return batch;
    }

    private static string BatchNumberOf(BulkMedicineRow row) =>
        MedicineBatch.NormalizeBatchNo(string.IsNullOrWhiteSpace(row.BatchNo)
            ? $"AUTO-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.CreateVersion7().ToString("N")[..8]}"
            : row.BatchNo);

    private static string IdentityKey(string name, string? strength, string? form) =>
        string.Join('|',
            name.Trim().ToUpperInvariant(),
            (strength ?? string.Empty).Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant(),
            (form ?? string.Empty).Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant());

    private sealed class BillGroup(Guid supplierId, string? invoice, DateOnly? receiptDate)
    {
        public Guid SupplierId { get; } = supplierId;

        public string? Invoice { get; } = invoice;

        public DateOnly? ReceiptDate { get; } = receiptDate;

        public List<SupplierStockReceiptLine> Lines { get; } = [];

        /// <summary>Set when the bill was paid at entry.</summary>
        public SupplierBillPayment? Payment { get; set; }
    }
}
