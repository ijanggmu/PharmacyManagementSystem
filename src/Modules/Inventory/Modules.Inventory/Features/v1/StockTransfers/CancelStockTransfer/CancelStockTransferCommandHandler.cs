using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.CancelStockTransfer;

/// <summary>
/// Cancel leg: only while still in transit. The destination was never touched, so cancelling restocks
/// each allocated lot back at the source branch with its original batch number, expiry, and cost.
/// </summary>
public sealed class CancelStockTransferCommandHandler(InventoryDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<CancelStockTransferCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelStockTransferCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var transfer = await dbContext.StockTransfers
            .FirstOrDefaultAsync(t => t.Id == command.StockTransferId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Stock transfer {command.StockTransferId} not found.");

        // The row locks taken when the source batches are increased must be held until the transfer commits,
        // so the restock joins this transaction.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

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
