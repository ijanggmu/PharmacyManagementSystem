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

        var created = new List<BulkCreatedMedicine>(command.Rows.Count);

        Guid? branchId = null;

        // Rows sharing (SupplierId, SupplierInvoiceNumber, ReceiptDate) are consolidated into one
        // bill posted once after the loop. Keyed by the trimmed invoice number so whitespace
        // differences don't split a bill into two groups; a row without an invoice number gets its
        // own key.
        var bills = new Dictionary<(Guid SupplierId, string Key, DateOnly? Date), BillGroup>();
        decimal openingStockValue = 0m;

        // A row naming a medicine that already exists (same name + strength + form) adds its stock to
        // that medicine instead of creating a duplicate — in the database, or created by an earlier row.
        var importedByIdentity = new Dictionary<string, Guid>(StringComparer.Ordinal);
        var importBatches = new Dictionary<(Guid MedicineId, string BatchNo), MedicineBatch>();

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

            Guid? batchId = null;
            if (row.Quantity > 0)
            {
                // Resolved lazily (once) — only needed when at least one row carries opening stock.
                branchId ??= await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

                var batch = await ReceiveBatchAsync(medicineId, branchId.Value, row, importBatches, cancellationToken)
                    .ConfigureAwait(false);
                batchId = batch.Id;

                dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                    medicineId, branchId.Value, batch.Id, InventoryTransactionType.Purchase, row.Quantity,
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

            created.Add(new BulkCreatedMedicine(medicineId, batchId, AddedToExisting: existingId is not null));
        }

        // The medicines and the receipt/opening-stock events commit together: the outbox joins this
        // transaction, so a failed save never leaves a payable for medicines that don't exist.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

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
    /// The row's batch: an existing live lot with the same number at this branch (in the database or
    /// opened earlier in this import) is topped up when the expiry matches; otherwise a new lot opens.
    /// </summary>
    private async Task<MedicineBatch> ReceiveBatchAsync(
        Guid medicineId, Guid branchId, BulkMedicineRow row,
        Dictionary<(Guid MedicineId, string BatchNo), MedicineBatch> importBatches, CancellationToken cancellationToken)
    {
        string batchNo = MedicineBatch.NormalizeBatchNo(string.IsNullOrWhiteSpace(row.BatchNo)
            ? $"AUTO-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.CreateVersion7().ToString("N")[..8]}"
            : row.BatchNo);

        if (!importBatches.TryGetValue((medicineId, batchNo), out var batch))
        {
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
            batch = await dbContext.MedicineBatches
                .FirstOrDefaultAsync(
                    b => b.MedicineId == medicineId && b.BranchId == branchId
                        && b.BatchNo.ToUpper() == batchNo && !b.IsDisposed,
                    cancellationToken)
                .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862
        }

        if (batch is null)
        {
            batch = MedicineBatch.Create(
                // No expiry given: stored as "no expiry", the same rule StockReceiptService applies —
                // never a made-up date that would let the lot sell past its real expiry.
                medicineId, branchId, batchNo, row.ExpiryDate ?? MedicineBatch.NoExpiryDate,
                row.Quantity, row.CostPrice, row.SellingPrice, row.RackLocation);
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
        }

        importBatches[(medicineId, batchNo)] = batch;
        return batch;
    }

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
