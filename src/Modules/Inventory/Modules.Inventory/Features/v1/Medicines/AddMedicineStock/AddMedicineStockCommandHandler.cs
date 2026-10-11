using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.AddMedicineStock;

public sealed class AddMedicineStockCommandHandler(
    InventoryDbContext dbContext,
    IStockReceiptService stockReceiptService,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch)
    : ICommandHandler<AddMedicineStockCommand, Guid>
{
    public async ValueTask<Guid> Handle(AddMedicineStockCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var medicine = await dbContext.Medicines.AsNoTracking()
            .Where(m => m.Id == command.MedicineId)
            .Select(m => new { m.Id, m.Name })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Medicine {command.MedicineId} not found.");

        // Same receipt path as a new medicine's opening stock: an existing batch number at this
        // branch tops that batch up (its expiry must match), a new one opens a new batch.
        return await MedicineStockIntake.ReceiveAsync(
            stockReceiptService, outbox, currentUser, currentBranch,
            new MedicineStockLine(
                medicine.Id, medicine.Name, command.Quantity, command.BatchNumber, command.ExpiryDate,
                command.RackLocation, command.CostPrice, command.SellingPrice, command.SupplierId,
                command.SupplierInvoiceNumber, command.VatAmount, command.Payment),
            referenceType: "MedicineAddStock",
            cancellationToken).ConfigureAwait(false);
    }
}
