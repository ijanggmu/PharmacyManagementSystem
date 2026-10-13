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

namespace FSH.Modules.Inventory.Features.v1.Batches.DisposeBatch;

/// <summary>
/// Writes a lot off (expired, damaged). The lot is locked (<c>FOR UPDATE</c>) and re-read inside the
/// transaction, so the written-off quantity — and the loss posted for it — is the committed quantity,
/// not one read before a concurrent sale. Callers confined to one branch can only dispose that branch's lots.
/// </summary>
public sealed class DisposeBatchCommandHandler(
    InventoryDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch)
    : ICommandHandler<DisposeBatchCommand, Guid>
{
    public async ValueTask<Guid> Handle(DisposeBatchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The lock, the write-off and its loss posting (expired/damaged stock) commit together.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        string notFound = $"Batch {command.BatchId} not found.";
        var batch = (await InventoryRowLocks.LockBatchesAsync(dbContext, [command.BatchId], cancellationToken).ConfigureAwait(false))
            .FirstOrDefault()
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(batch.BranchId, notFound, cancellationToken).ConfigureAwait(false);

        decimal disposedQuantity = batch.WriteOff();
        string reason = WriteOffReasons.Describe(command.Category, command.Reason);

        if (disposedQuantity != 0)
        {
            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                batch.MedicineId, batch.BranchId, batch.Id, InventoryTransactionType.Dispose, -disposedQuantity,
                batch.CostPrice, notes: reason));
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // Consigned stock isn't the pharmacy's, so writing it off posts no stock loss.
        bool consigned = await ConsignedStock.IsConsignedAsync(dbContext, batch.Id, cancellationToken).ConfigureAwait(false);
        await InventoryAdjustmentPublisher.PublishAsync(
            outbox, currentUser, consigned ? 0m : -disposedQuantity * batch.CostPrice,
            $"Batch {batch.BatchNo} written off: {reason}", batch.BranchId, cancellationToken)
            .ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return batch.Id;
    }
}
