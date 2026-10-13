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

namespace FSH.Modules.Inventory.Features.v1.Batches.AdjustBatchQuantity;

/// <summary>
/// Sets a lot's quantity to a counted figure. The lot is locked (<c>FOR UPDATE</c>) and re-read inside the
/// transaction before the new quantity is applied, so a sale that commits in between is not overwritten:
/// the delta (and its gain/loss posting) is computed against the committed quantity. Callers confined to
/// one branch can only adjust that branch's lots.
/// </summary>
public sealed class AdjustBatchQuantityCommandHandler(
    InventoryDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch)
    : ICommandHandler<AdjustBatchQuantityCommand, Guid>
{
    public async ValueTask<Guid> Handle(AdjustBatchQuantityCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The lock, the quantity change and its gain/loss posting commit together (the outbox joins this transaction).
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        string notFound = $"Batch {command.BatchId} not found.";
        var batch = (await InventoryRowLocks.LockBatchesAsync(dbContext, [command.BatchId], cancellationToken).ConfigureAwait(false))
            .FirstOrDefault()
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(batch.BranchId, notFound, cancellationToken).ConfigureAwait(false);

        decimal delta = BatchAdjustmentWriter.Apply(dbContext, batch, command.NewQuantity, command.Reason);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // Consigned stock isn't the pharmacy's, so adjusting it posts no stock gain or loss.
        bool consigned = await ConsignedStock.IsConsignedAsync(dbContext, batch.Id, cancellationToken).ConfigureAwait(false);
        await InventoryAdjustmentPublisher.PublishAsync(
            outbox, currentUser, consigned ? 0m : delta * batch.CostPrice,
            $"Batch {batch.BatchNo} quantity adjusted: {command.Reason}", batch.BranchId, cancellationToken)
            .ConfigureAwait(false);

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return batch.Id;
    }
}
