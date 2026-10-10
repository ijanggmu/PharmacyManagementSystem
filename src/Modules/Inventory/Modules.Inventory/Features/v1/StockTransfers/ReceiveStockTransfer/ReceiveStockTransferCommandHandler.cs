using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.ReceiveStockTransfer;

/// <summary>
/// Receive leg: completes the transfer and recreates each allocated lot at the destination branch with
/// its original batch number, expiry, and cost (increasing a live batch with that number if one exists).
/// <see cref="StockTransfer.MarkReceived"/> throws (409) before any stock is touched when the transfer is
/// not still in transit.
/// </summary>
public sealed class ReceiveStockTransferCommandHandler(InventoryDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<ReceiveStockTransferCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReceiveStockTransferCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var transfer = await dbContext.StockTransfers
            .FirstOrDefaultAsync(t => t.Id == command.StockTransferId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Stock transfer {command.StockTransferId} not found.");

        // The row locks taken when the destination batches are increased must be held until the transfer commits,
        // so the restock joins this transaction.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        transfer.MarkReceived(currentUser.GetUserId());

        var allocations = await dbContext.StockTransferBatches
            .Where(a => a.StockTransferId == transfer.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        await StockTransferStockWriter.RestockAsync(
            dbContext, transfer.ToBranchId, transfer.Id, allocations,
            $"Transfer in from branch {transfer.FromBranchId}", cancellationToken).ConfigureAwait(false);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return transfer.Id;
    }
}
