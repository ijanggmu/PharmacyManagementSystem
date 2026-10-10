using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Consignment.ReceiveConsignmentStock;

public sealed class ReceiveConsignmentStockCommandHandler(
    InventoryDbContext dbContext,
    IStockReceiptService stockReceiptService,
    ICurrentBranch currentBranch) : ICommandHandler<ReceiveConsignmentStockCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReceiveConsignmentStockCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Nullable — ConsignmentPosition is a ledger/reporting entity (docs/branch-scoping-plan.md),
        // persisted null when the tenant has no branches configured.
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // Optional inputs fall back to the legacy defaults: a generated batch number, no expiry, and
        // the medicine's default unit price as the selling price.
        decimal sellingPrice = command.SellingPrice ?? await dbContext.Medicines
            .Where(m => m.Id == command.MedicineId)
            .Select(m => m.UnitPrice)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        string batchNo = string.IsNullOrWhiteSpace(command.BatchNo)
            ? $"CONSIGN-{Guid.CreateVersion7():N}"
            : command.BatchNo.Trim();

        var results = await stockReceiptService.ReceiveAsync(
            new StockReceiptRequest(
                ReferenceType: "Consignment",
                ReferenceId: command.SupplierId,
                Lines:
                [
                    new StockReceiptLine(
                        command.MedicineId, batchNo, command.ExpiryDate ?? MedicineBatch.NoExpiryDate, command.Quantity,
                        command.UnitCostPrice, sellingPrice, command.RackLocation),
                ]),
            cancellationToken).ConfigureAwait(false);

        var receipt = results[0];

        var position = ConsignmentPosition.Create(
            command.SupplierId, command.MedicineId, receipt.BatchId, receipt.BatchNo,
            receipt.QuantityReceived, command.UnitCostPrice, DateTime.UtcNow, branchId);

        dbContext.ConsignmentPositions.Add(position);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return position.Id;
    }
}
