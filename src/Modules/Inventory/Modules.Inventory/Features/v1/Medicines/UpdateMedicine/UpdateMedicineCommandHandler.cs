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
            await BatchSellingPrices.FollowMedicinePriceAsync(
                dbContext, medicine.Id, previousUnitPrice, medicine.UnitPrice, cancellationToken).ConfigureAwait(false);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // Stock path 1: receive a new lot of a given quantity (increase only). The lot's batch number
        // and expiry get the legacy defaults inside StockReceiptService when they are missing.
        if (command.InitialStockQuantity is > 0)
        {
            decimal receivedQuantity = command.InitialStockQuantity.Value;
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

        // Stock path 2: set this branch's on-hand to the target quantity, with a reason. This is a
        // stock-count correction, not a purchase, so it never creates a supplier bill: the value of
        // the difference posts as a stock gain or loss.
        if (command.StockAdjustmentTargetQuantity is { } targetQuantity)
        {
            string reason = command.StockAdjustmentReason!.Trim();
            (decimal valueChange, Guid branchId) = await SetOnHandToTargetAsync(
                medicine, targetQuantity, reason, command.RackLocation, cancellationToken)
                .ConfigureAwait(false);

            await InventoryAdjustmentPublisher.PublishAsync(
                outbox, currentUser, valueChange, $"Stock adjustment for {medicine.Name}: {reason}", branchId,
                cancellationToken).ConfigureAwait(false);
        }

        return medicine.Id;
    }

    /// <summary>
    /// Moves this branch's on-hand for the medicine to <paramref name="targetQuantity"/>. A decrease
    /// consumes lots first-expired-first-out, using the same <see cref="MedicineBatch.Deduct"/> the
    /// sale path uses. An increase creates one lot. Each movement is written to the inventory ledger
    /// as an <see cref="InventoryTransactionType.Adjustment"/> carrying the reason. Returns the signed
    /// cost of the change (each lot's quantity x its cost price) and the branch it happened at.
    /// </summary>
    private async Task<(decimal ValueChange, Guid BranchId)> SetOnHandToTargetAsync(
        Medicine medicine,
        decimal targetQuantity,
        string reason,
        string? rackLocation,
        CancellationToken cancellationToken)
    {
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // Tracked, FEFO-ordered lots at this branch. Tracking is required because the lots are mutated.
        var lots = await dbContext.MedicineBatches
            .Where(b => b.MedicineId == medicine.Id && b.BranchId == branchId && !b.IsDisposed && b.QuantityOnHand > 0)
            .OrderByFefo()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal onHand = lots.Sum(b => b.QuantityOnHand);
        decimal delta = targetQuantity - onHand;

        if (delta == 0)
        {
            return (0m, branchId);
        }

        if (delta < 0)
        {
            decimal toRemove = -delta;
            if (toRemove > onHand)
            {
                throw new CustomException(
                    $"Cannot reduce stock by {toRemove}: only {onHand} on hand at this branch.",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            decimal remaining = toRemove;
            decimal valueRemoved = 0m;
            foreach (var lot in lots)
            {
                if (remaining <= 0)
                {
                    break;
                }

                decimal take = Math.Min(remaining, lot.QuantityOnHand);
                lot.Deduct(take);
                remaining -= take;
                valueRemoved += take * lot.CostPrice;

                dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                    medicine.Id, branchId, lot.Id, InventoryTransactionType.Adjustment, -take, lot.CostPrice,
                    StockReferenceType, medicine.Id, reason));
            }

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return (-valueRemoved, branchId);
        }

        var newLot = MedicineBatch.Create(
            medicine.Id,
            branchId,
            StockReceiptService.NewAutoBatchNumber(),
            MedicineBatch.NoExpiryDate,
            delta,
            medicine.CostPrice,
            medicine.UnitPrice,
            rackLocation);
        dbContext.MedicineBatches.Add(newLot);
        dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
            medicine.Id, branchId, newLot.Id, InventoryTransactionType.Adjustment, delta, medicine.CostPrice,
            StockReferenceType, medicine.Id, reason));

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return (delta * medicine.CostPrice, branchId);
    }
}
