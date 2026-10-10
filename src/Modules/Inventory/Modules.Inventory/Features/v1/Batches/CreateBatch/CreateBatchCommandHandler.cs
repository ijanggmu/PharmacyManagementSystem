using System.Data;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;

public sealed class CreateBatchCommandHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    IOutboxWriter outbox,
    ICurrentUser currentUser)
    : ICommandHandler<CreateBatchCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateBatchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        bool medicineExists = await dbContext.Medicines
            .AnyAsync(m => m.Id == command.MedicineId, cancellationToken)
            .ConfigureAwait(false);
        if (!medicineExists)
        {
            throw new NotFoundException($"Medicine {command.MedicineId} not found.");
        }

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var batch = MedicineBatch.Create(
            command.MedicineId, branchId, command.BatchNo, command.ExpiryDate, command.Quantity,
            command.CostPrice, command.SellingPrice, command.RackLocation);

        dbContext.MedicineBatches.Add(batch);

        if (command.Quantity > 0)
        {
            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                command.MedicineId, branchId, batch.Id, InventoryTransactionType.Adjustment, command.Quantity,
                command.CostPrice, notes: "Initial batch entry"));
        }

        // A batch entered by hand carries no supplier bill, so its value posts as opening stock
        // (Dr Inventory / Cr Owner's Equity), committed together with the batch.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await OpeningStockPublisher.PublishAsync(
            outbox, currentUser, command.Quantity * command.CostPrice, $"Opening stock: batch {batch.BatchNo}", branchId,
            cancellationToken).ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return batch.Id;
    }
}
