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

namespace FSH.Modules.Inventory.Features.v1.Batches.DisposeBatch;

public sealed class DisposeBatchCommandHandler(
    InventoryDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser)
    : ICommandHandler<DisposeBatchCommand, Guid>
{
    public async ValueTask<Guid> Handle(DisposeBatchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The write-off and its loss posting (expired/damaged stock) commit together.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        // Lock before reading, so a sale or transfer committing in between can't make the recorded
        // delta (and its gain/loss posting) disagree with the real change in stock.
        await InventoryRowLocks.LockBatchRowAsync(dbContext, command.BatchId, cancellationToken).ConfigureAwait(false);

        var batch = await dbContext.MedicineBatches
            .FirstOrDefaultAsync(b => b.Id == command.BatchId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Batch {command.BatchId} not found.");

        decimal disposedQuantity = batch.WriteOff();

        if (disposedQuantity != 0)
        {
            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                batch.MedicineId, batch.BranchId, batch.Id, InventoryTransactionType.Dispose, -disposedQuantity,
                batch.CostPrice, notes: command.Reason));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await InventoryAdjustmentPublisher.PublishAsync(
            outbox, currentUser, -disposedQuantity * batch.CostPrice,
            $"Batch {batch.BatchNo} written off: {command.Reason}", batch.BranchId, cancellationToken)
            .ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return batch.Id;
    }
}
