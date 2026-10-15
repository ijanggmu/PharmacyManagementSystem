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

        // Same name + strength + form is the same product: new stock belongs on the existing medicine
        // as another batch. The form checks first and offers that; this guards every other caller.
        if (!command.AllowDuplicate)
        {
            var duplicates = await MedicineIdentityGuard.FindDuplicatesAsync(
                dbContext, command.Name, command.Strength, command.Form, excludeId: null, cancellationToken)
                .ConfigureAwait(false);
            if (duplicates.Count > 0)
            {
                throw new CustomException(
                    $"{duplicates[0].Name} already exists with the same strength and form. Add the stock as a new batch of the existing medicine, or confirm this is a different product.",
                    duplicates.Select(d => d.Id.ToString()),
                    HttpStatusCode.Conflict);
            }
        }

        await MedicineIdentityGuard.EnsureBarcodeAvailableAsync(dbContext, command.Barcode, excludeId: null, cancellationToken)
            .ConfigureAwait(false);

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
            controlledSchedule: command.ControlledSchedule,
            packsPerBox: command.PacksPerBox,
            boxLabel: command.BoxLabel);
        dbContext.Medicines.Add(medicine);

        // The medicine, its opening lot and the purchase/opening-stock event commit together (the
        // outbox joins this transaction): a failed receipt never leaves a medicine without its stock,
        // and a failed save never leaves a posting for stock that doesn't exist.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // The .NET port of createMedicineRecordOnly's initial-stock branch: seed a batch for the
        // requested opening stock, posted as a purchase (with a supplier) or opening stock.
        if (command.InitialStockQuantity is > 0)
        {
            await MedicineStockIntake.ReceiveAsync(
                stockReceiptService, outbox, currentUser, currentBranch,
                new MedicineStockLine(
                    medicine.Id, medicine.Name, command.InitialStockQuantity.Value, command.BatchNumber,
                    command.ExpiryDate, command.RackLocation, command.CostPrice, command.SellingPrice,
                    medicine.SupplierId, command.SupplierInvoiceNumber, command.VatAmount, command.Payment,
                    command.StockFunding),
                referenceType: "MedicineCreate",
                cancellationToken).ConfigureAwait(false);
        }

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return medicine.Id;
    }
}
