using System.Data;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Batches.AdjustBatchQuantity;

public sealed class AdjustBatchQuantityCommandHandler(
    InventoryDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser)
    : ICommandHandler<AdjustBatchQuantityCommand, Guid>
{
    public async ValueTask<Guid> Handle(AdjustBatchQuantityCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var batch = await dbContext.MedicineBatches
            .FirstOrDefaultAsync(b => b.Id == command.BatchId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Batch {command.BatchId} not found.");

        decimal delta = batch.SetQuantity(command.NewQuantity);

        if (delta != 0)
        {
            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                batch.MedicineId, batch.BranchId, batch.Id, InventoryTransactionType.Adjustment, delta,
                batch.CostPrice, notes: command.Reason));
        }

        // The quantity change and its gain/loss posting commit together (the outbox joins this transaction).
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await InventoryAdjustmentPublisher.PublishAsync(
            outbox, currentUser, delta * batch.CostPrice,
            $"Batch {batch.BatchNo} quantity adjusted: {command.Reason}", batch.BranchId, cancellationToken)
            .ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return batch.Id;
    }
}
