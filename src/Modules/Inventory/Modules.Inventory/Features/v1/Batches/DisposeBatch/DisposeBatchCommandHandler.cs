using System.Data;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
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
    ICurrentBranch currentBranch,
    IMediator mediator)
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

        // A lot on an open expiry claim is waiting for the supplier to take it back (an accepted claim returns those
        // units on a debit note); writing it off now would destroy stock the claim still counts on.
        var onClaim = await mediator.Send(new GetOpenExpiryClaimQuantitiesQuery([batch.Id]), cancellationToken)
            .ConfigureAwait(false);
        if (onClaim is not null && onClaim.TryGetValue(batch.Id, out decimal held) && held > 0)
        {
            throw new CustomException(
                $"Batch {batch.BatchNo} is on an open supplier expiry claim ({held} units). Wait for the supplier's answer, or reject the claim, before writing it off.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

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
