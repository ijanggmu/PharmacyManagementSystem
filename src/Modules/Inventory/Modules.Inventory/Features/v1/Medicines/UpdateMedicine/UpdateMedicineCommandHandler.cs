using System.Data;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;

/// <summary>
/// Edits a medicine, optionally receiving a new lot or correcting this branch's on-hand to a counted
/// figure. Everything — the medicine row, its price history, the re-priced lots, the stock movement and
/// the GL event in the outbox — commits in one transaction, so a failed stock step never leaves a
/// half-applied edit (or a posting without its stock). A price change re-prices the medicine's live
/// lots (<see cref="MedicinePriceApplier"/>) so the till charges it at once.
/// </summary>
public sealed class UpdateMedicineCommandHandler(
    InventoryDbContext dbContext,
    IStockReceiptService stockReceiptService,
    ICurrentBranch currentBranch,
    IOutboxWriter outbox,
    ICurrentUser currentUser)
    : ICommandHandler<UpdateMedicineCommand, Guid>
{
    private const string StockReferenceType = "MedicineStockAdjustment";

    public async ValueTask<Guid> Handle(UpdateMedicineCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var medicine = await dbContext.Medicines
            .FirstOrDefaultAsync(m => m.Id == command.MedicineId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {command.MedicineId} not found.");

        await MedicineIdentityGuard.EnsureBarcodeAvailableAsync(dbContext, command.Barcode, medicine.Id, cancellationToken)
            .ConfigureAwait(false);

        decimal previousUnitPrice = medicine.UnitPrice;
        decimal previousCostPrice = medicine.CostPrice;

        medicine.Update(
            command.Name,
            command.GenericName,
            command.CategoryId,
            command.ReorderLevel,
            command.IsControlled,
            // Omitted prices keep the stored value instead of silently resetting to 0.
            unitPrice: command.UnitPrice ?? medicine.UnitPrice,
            costPrice: command.CostPrice ?? medicine.CostPrice,
            form: command.Form,
            strength: command.Strength,
            supplierId: command.SupplierId,
            barcode: command.Barcode,
            description: command.Description,
            // Omitted values keep the stored value. PrescriptionRequired is never silently reset to false.
            // ClearMaximumStock is the explicit way to unset MaximumStock; null alone means "keep stored".
            maximumStock: command.MaximumStock ?? medicine.MaximumStock,
            prescriptionRequired: command.PrescriptionRequired ?? medicine.PrescriptionRequired,
            clearMaximumStock: command.ClearMaximumStock,
            // ClearOptionalDetails is the explicit way to unset the optional details below; null alone means "keep stored".
            clearOptionalDetails: command.ClearOptionalDetails,
            // Omitted legacy fields keep the stored value (Medicine.Update treats null as "keep").
            brandName: command.BrandName,
            dosage: command.Dosage,
            sideEffects: command.SideEffects,
            storageInstructions: command.StorageInstructions,
            storageTempMinC: command.StorageTempMinC,
            storageTempMaxC: command.StorageTempMaxC,
            requiresColdChain: command.RequiresColdChain,
            unitsPerPack: command.UnitsPerPack,
            unitLabel: command.UnitLabel,
            isTaxable: command.IsTaxable,
            supplierInvoiceNumber: command.SupplierInvoiceNumber,
            vatAmount: command.VatAmount,
            // Null keeps the stored schedule; ClearControlledSchedule is the explicit unset.
            controlledSchedule: command.ControlledSchedule,
            clearControlledSchedule: command.ClearControlledSchedule);

        // Every price change shows in the price history: who changed it is in the audit trail,
        // when and from/to what is here.
        if (medicine.UnitPrice != previousUnitPrice || medicine.CostPrice != previousCostPrice)
        {
            await MedicinePriceHistoryRecorder.RecordActiveAsync(
                dbContext, medicine.Id, medicine.UnitPrice, medicine.CostPrice,
                command.PriceChangeReason ?? "Changed on the medicine form", cancellationToken)
                .ConfigureAwait(false);
        }

        // A sale charges a lot's own selling price, so the new price has to reach the lots on the shelf that
        // were at the old one.
        if (medicine.UnitPrice != previousUnitPrice)
        {
            await MedicinePriceApplier.RepriceLiveBatchesAsync(dbContext, medicine.Id, previousUnitPrice, medicine.UnitPrice, cancellationToken)
                .ConfigureAwait(false);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // Stock path 1: receive a new lot of a given quantity (increase only). The lot's batch number
        // and expiry get the legacy defaults inside StockReceiptService when they are missing.
        if (command.InitialStockQuantity is > 0)
        {
            await ReceiveNewLotAsync(command, medicine, cancellationToken).ConfigureAwait(false);
        }

        // Stock path 2: set this branch's on-hand to the target quantity, with a reason. This is a
        // stock-count correction, not a purchase, so it never creates a supplier bill: the value of
        // the difference posts as a stock gain or loss.
        if (command.StockAdjustmentTargetQuantity is { } targetQuantity)
        {
            string reason = command.StockAdjustmentReason!.Trim();
            (decimal valueChange, Guid branchId) = await SetOnHandToTargetAsync(
                medicine, command, targetQuantity, reason, cancellationToken)
                .ConfigureAwait(false);

            await InventoryAdjustmentPublisher.PublishAsync(
                outbox, currentUser, valueChange, $"Stock adjustment for {medicine.Name}: {reason}", branchId,
                cancellationToken).ConfigureAwait(false);
        }

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return medicine.Id;
    }

    private async Task ReceiveNewLotAsync(UpdateMedicineCommand command, Medicine medicine, CancellationToken cancellationToken)
    {
        decimal receivedQuantity = command.InitialStockQuantity!.Value;
        // medicine.CostPrice already reflects command.CostPrice, or the stored value when it was omitted.
        decimal unitCost = medicine.CostPrice;

        await stockReceiptService.ReceiveAsync(
            new StockReceiptRequest(
                ReferenceType: StockReferenceType,
                ReferenceId: medicine.Id,
                Lines: [
                    new StockReceiptLine(
                        medicine.Id,
                        command.BatchNumber,
                        command.ExpiryDate,
                        receivedQuantity,
                        unitCost,
                        command.SellingPrice ?? 0m,
                        command.RackLocation)
                ]),
            cancellationToken).ConfigureAwait(false);

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (medicine.SupplierId is not null)
        {
            await SupplierStockReceiptPublisher.PublishIfPayableAsync(
                outbox, currentUser, medicine.Id, medicine.SupplierId, receivedQuantity, unitCost,
                command.VatAmount ?? 0m, command.SupplierInvoiceNumber, branchId, cancellationToken).ConfigureAwait(false);
        }
        else
        {
            await OpeningStockPublisher.PublishAsync(
                outbox, currentUser, receivedQuantity * unitCost, $"Stock received for {medicine.Name} (no supplier)", branchId,
                cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Moves this branch's on-hand for the medicine to <paramref name="targetQuantity"/>. The branch's
    /// lots are locked (<c>FOR UPDATE</c>) and re-read first, so a sale committing in between is counted
    /// instead of overwritten. A decrease consumes lots first-expired-first-out, using the same
    /// <see cref="MedicineBatch.Deduct"/> the sale path uses. An increase is added to the earliest live,
    /// sellable lot — counted stock is never given a made-up expiry. With no such lot, the command must
    /// say which lot the stock is (its expiry, and optionally its batch number). Each movement is written
    /// to the inventory ledger as an <see cref="InventoryTransactionType.Adjustment"/> carrying the
    /// reason. Returns the signed cost of the change and the branch it happened at.
    /// </summary>
    private async Task<(decimal ValueChange, Guid BranchId)> SetOnHandToTargetAsync(
        Medicine medicine,
        UpdateMedicineCommand command,
        decimal targetQuantity,
        string reason,
        CancellationToken cancellationToken)
    {
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var today = NepalClock.Today();

        var lotIds = await dbContext.MedicineBatches.AsNoTracking()
            .Where(b => b.MedicineId == medicine.Id && b.BranchId == branchId && !b.IsDisposed)
            .Select(b => b.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Tracked, locked, FEFO-ordered lots at this branch, with their committed quantities.
        var lots = (await InventoryRowLocks.LockBatchesAsync(dbContext, lotIds, cancellationToken).ConfigureAwait(false))
            .Where(b => b.BranchId == branchId && !b.IsDisposed)
            .OrderByFefo()
            .ToList();

        decimal onHand = lots.Sum(b => b.QuantityOnHand);
        decimal delta = targetQuantity - onHand;

        // Consigned lots are the supplier's stock: counting them up or down moves no value on the books.
        var consigned = await ConsignedStock.ConsignedAmongAsync(dbContext, lots.Select(l => l.Id).ToList(), cancellationToken)
            .ConfigureAwait(false);

        if (delta == 0)
        {
            return (0m, branchId);
        }

        if (delta < 0)
        {
            decimal toRemove = -delta;
            decimal remaining = toRemove;
            decimal valueRemoved = 0m;
            foreach (var lot in lots.Where(l => l.QuantityOnHand > 0))
            {
                if (remaining <= 0)
                {
                    break;
                }

                decimal take = Math.Min(remaining, lot.QuantityOnHand);
                lot.Deduct(take);
                remaining -= take;
                valueRemoved += consigned.Contains(lot.Id) ? 0m : take * lot.CostPrice;

                dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                    medicine.Id, branchId, lot.Id, InventoryTransactionType.Adjustment, -take, lot.CostPrice,
                    StockReferenceType, medicine.Id, reason));
            }

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return (-valueRemoved, branchId);
        }

        var target = lots.FirstOrDefault(l => !l.IsRecalled && FefoBatchOrdering.IsSellableOn(l.ExpiryDate, today));
        if (target is null)
        {
            target = await OpenCountedLotAsync(medicine, command, branchId, delta, cancellationToken).ConfigureAwait(false);
        }
        else
        {
            target.Increase(delta);
        }

        dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
            medicine.Id, branchId, target.Id, InventoryTransactionType.Adjustment, delta, target.CostPrice,
            StockReferenceType, medicine.Id, reason));

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (consigned.Contains(target.Id) ? 0m : delta * target.CostPrice, branchId);
    }

    /// <summary>
    /// A counted surplus with no sellable lot to add it to: the lot is opened from the expiry (and batch
    /// number) the command names. Without an expiry there is nothing truthful to record, so the request is
    /// rejected rather than inventing one.
    /// </summary>
    private async Task<MedicineBatch> OpenCountedLotAsync(
        Medicine medicine, UpdateMedicineCommand command, Guid branchId, decimal quantity, CancellationToken cancellationToken)
    {
        if (command.ExpiryDate is not { } expiry)
        {
            throw new CustomException(
                "There is no unexpired lot of this medicine at this branch to add the counted stock to. Enter the expiry date (and batch number) of the stock you counted.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        string batchNo = MedicineBatch.NormalizeBatchNo(
            string.IsNullOrWhiteSpace(command.BatchNumber) ? StockReceiptService.NewAutoBatchNumber() : command.BatchNumber);
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
        bool batchExists = await dbContext.MedicineBatches
            .AnyAsync(
                b => b.MedicineId == medicine.Id && b.BranchId == branchId && !b.IsDisposed && b.BatchNo.ToUpper() == batchNo,
                cancellationToken)
            .ConfigureAwait(false);
#pragma warning restore CA1304, CA1311, CA1862
        if (batchExists)
        {
            throw new CustomException(
                $"Batch {batchNo} already exists for this medicine at this branch (expired or recalled). Use a different batch number, or adjust that batch directly.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var lot = MedicineBatch.Create(
            medicine.Id, branchId, batchNo, expiry, quantity, medicine.CostPrice,
            command.SellingPrice ?? medicine.UnitPrice, command.RackLocation);
        dbContext.MedicineBatches.Add(lot);
        return lot;
    }
}
