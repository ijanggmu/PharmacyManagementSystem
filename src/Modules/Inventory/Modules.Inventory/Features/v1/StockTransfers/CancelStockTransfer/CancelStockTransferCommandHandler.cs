using System.Data;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.CancelStockTransfer;

/// <summary>
/// Cancel leg: only while still in transit, and only by the source branch (the caller's current branch
/// must be the transfer's <c>FromBranchId</c>). The destination was never touched, so cancelling
/// restocks each allocated lot back at the source branch with its original batch number, expiry, and cost.
/// The transfer row is locked and re-read inside the transaction before its status is checked, so a
/// cancel racing a receive (or a second cancel) is rejected instead of restocking twice.
/// </summary>
public sealed class CancelStockTransferCommandHandler(
    InventoryDbContext dbContext,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch)
    : ICommandHandler<CancelStockTransferCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelStockTransferCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The row locks taken on the transfer and on the source batches must be held until the transfer
        // commits, so everything runs in this one transaction.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var transfer = await InventoryRowLocks.LockStockTransferAsync(dbContext, command.StockTransferId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Stock transfer {command.StockTransferId} not found.");

        Guid? callerBranchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (callerBranchId != transfer.FromBranchId)
        {
            throw new ForbiddenException("Only the branch that dispatched this transfer can cancel it.");
        }

        transfer.Cancel(currentUser.GetUserId(), command.Reason);

        var allocations = await dbContext.StockTransferBatches
            .Where(a => a.StockTransferId == transfer.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        await StockTransferStockWriter.RestockAsync(
            dbContext, transfer.FromBranchId, transfer.Id, allocations,
            $"Transfer cancelled: {command.Reason}", cancellationToken).ConfigureAwait(false);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return transfer.Id;
    }
}
