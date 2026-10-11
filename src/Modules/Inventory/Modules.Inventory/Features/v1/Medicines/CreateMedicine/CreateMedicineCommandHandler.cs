using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Inventory.Features.v1.Medicines.CreateMedicine;

public sealed class CreateMedicineCommandHandler(
    InventoryDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch)
    : ICommandHandler<CreateMedicineCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateMedicineCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var medicine = Medicine.Create(
            command.Name,
            command.GenericName,
            command.CategoryId,
            command.ReorderLevel,
            command.IsControlled,
            unitPrice: command.UnitPrice ?? 0m,
            costPrice: command.CostPrice ?? 0m,
            form: command.Form,
            strength: command.Strength,
            supplierId: command.SupplierId,
            barcode: command.Barcode,
            description: command.Description,
            maximumStock: command.MaximumStock,
            prescriptionRequired: command.PrescriptionRequired ?? false,
            brandName: command.BrandName,
            dosage: command.Dosage,
            sideEffects: command.SideEffects,
            storageInstructions: command.StorageInstructions,
            storageTempMinC: command.StorageTempMinC,
            storageTempMaxC: command.StorageTempMaxC,
            requiresColdChain: command.RequiresColdChain ?? false,
            unitsPerPack: command.UnitsPerPack,
            unitLabel: command.UnitLabel,
            isTaxable: command.IsTaxable ?? true,
            supplierInvoiceNumber: command.SupplierInvoiceNumber,
            vatAmount: command.VatAmount,
            controlledSchedule: command.ControlledSchedule);
        dbContext.Medicines.Add(medicine);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // The .NET port of createMedicineRecordOnly's initial-stock branch: seed a batch for the
        // requested opening stock. Reuses IStockReceiptService — the same internal surface Purchasing
        // calls to receive stock — instead of inserting a MedicineBatch/InventoryTransaction a third
        // time (CreateBatchCommandHandler already does so for the manual/opening-stock path).
        // A missing batch number is generated and a missing expiry is stored as non-expiring
        // (StockReceiptService applies the legacy defaults).
        if (command.InitialStockQuantity is > 0)
        {
            decimal openingQuantity = command.InitialStockQuantity.Value;
            decimal unitCost = command.CostPrice ?? 0m;

            await stockReceiptService.ReceiveAsync(
                new StockReceiptRequest(
                    ReferenceType: "MedicineCreate",
                    ReferenceId: medicine.Id,
                    Lines: [
                        new StockReceiptLine(
                            medicine.Id,
                            command.BatchNumber,
                            command.ExpiryDate,
                            openingQuantity,
                            unitCost,
                            command.SellingPrice ?? 0m,
                            command.RackLocation)
                    ]),
                cancellationToken).ConfigureAwait(false);

            Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

            // With a supplier this is a purchase (direct goods receipt + payable, as legacy
            // createMedicineWithInventory posted); without one it is opening stock the pharmacy
            // already owns, valued into Inventory against equity.
            if (medicine.SupplierId is not null)
            {
                await SupplierStockReceiptPublisher.PublishIfPayableAsync(
                    outbox, currentUser, medicine.Id, medicine.SupplierId, openingQuantity, unitCost,
                    command.VatAmount ?? 0m, command.SupplierInvoiceNumber, branchId, cancellationToken,
                    payment: command.Payment).ConfigureAwait(false);
            }
            else
            {
                await OpeningStockPublisher.PublishAsync(
                    outbox, currentUser, openingQuantity * unitCost, $"Opening stock for {medicine.Name}", branchId,
                    cancellationToken).ConfigureAwait(false);
            }
        }

        return medicine.Id;
    }
}
