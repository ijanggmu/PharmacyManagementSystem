using System.Data;
using FSH.Framework.Core.Context;
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

        foreach (var row in command.Rows)
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

            Guid? batchId = null;
            if (row.Quantity > 0)
            {
                // Resolved lazily (once) — only needed when at least one row carries opening stock.
                branchId ??= await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

                string batchNo = string.IsNullOrWhiteSpace(row.BatchNo)
                    ? $"AUTO-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.CreateVersion7().ToString("N")[..8]}"
                    : row.BatchNo;

                var batch = MedicineBatch.Create(
                    medicine.Id, branchId.Value, batchNo, row.ExpiryDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)),
                    row.Quantity, row.CostPrice, row.SellingPrice, row.RackLocation);
                dbContext.MedicineBatches.Add(batch);
                batchId = batch.Id;

                dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                    medicine.Id, branchId.Value, batch.Id, InventoryTransactionType.Purchase, row.Quantity,
                    row.CostPrice, referenceType: "bulk_import"));

                if (row.SupplierId is Guid supplierId)
                {
                    string? invoice = string.IsNullOrWhiteSpace(row.SupplierInvoiceNumber)
                        ? null
                        : row.SupplierInvoiceNumber.Trim();
                    var key = (supplierId, invoice ?? medicine.Id.ToString(), row.ReceiptDate);
                    if (!bills.TryGetValue(key, out var bill))
                    {
                        bill = new BillGroup(supplierId, invoice, row.ReceiptDate);
                        bills[key] = bill;
                    }

                    bill.Lines.Add(new SupplierStockReceiptLine(medicine.Id, row.Quantity, row.CostPrice, row.VatAmount));
                    bill.Payment ??= row.Payment;
                }
                else
                {
                    openingStockValue += row.Quantity * row.CostPrice;
                }
            }

            created.Add(new BulkCreatedMedicine(medicine.Id, batchId));
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
