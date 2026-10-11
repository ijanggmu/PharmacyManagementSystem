using System.Data;
using System.Diagnostics;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.ReceiveStockTransfer;

/// <summary>
/// Receive leg: completes the transfer and recreates each allocated lot at the destination branch with
/// its original batch number, expiry, and cost (increasing a live batch with that number if one exists).
///
/// The transfer row is locked (<c>FOR UPDATE</c>) and re-read inside the transaction before its status
/// is checked, so two concurrent receives (or a receive racing a cancel) serialize: the second sees the
/// committed status and <see cref="StockTransfer.MarkReceived"/> rejects it (409) before any stock is
/// touched. Only the destination branch receives — the caller's current branch must be the transfer's
/// <c>ToBranchId</c>, unless the caller can act for every branch (<c>Branches.ViewAll</c>).
///
/// The GL side (inventory moving from the source branch to the destination at cost) is published as
/// <see cref="StockTransferReceivedIntegrationEvent"/> through the outbox in the same transaction.
/// </summary>
public sealed class ReceiveStockTransferCommandHandler(
    InventoryDbContext dbContext,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IOutboxWriter outbox)
    : ICommandHandler<ReceiveStockTransferCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReceiveStockTransferCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // The row locks taken on the transfer and on the destination batches must be held until the
        // transfer commits, so everything runs in this one transaction.
        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var transfer = await InventoryRowLocks.LockStockTransferAsync(dbContext, command.StockTransferId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Stock transfer {command.StockTransferId} not found.");

        await EnsureCallerIsAtDestinationAsync(transfer, cancellationToken).ConfigureAwait(false);

        transfer.MarkReceived(currentUser.GetUserId());

        var allocations = await dbContext.StockTransferBatches
            .Where(a => a.StockTransferId == transfer.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        await StockTransferStockWriter.RestockAsync(
            dbContext, transfer.ToBranchId, transfer.Id, allocations,
            $"Transfer in from branch {transfer.FromBranchId}", cancellationToken).ConfigureAwait(false);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (allocations.Count > 0)
        {
            await outbox.AddAsync(new StockTransferReceivedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: currentUser.GetTenant(),
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Inventory",
                StockTransferId: transfer.Id,
                TransferNumber: transfer.TransferNumber,
                FromBranchId: transfer.FromBranchId,
                ToBranchId: transfer.ToBranchId,
                TotalCost: allocations.Sum(a => a.Quantity * a.CostPrice),
                Lines: allocations
                    .Select(a => new StockTransferReceivedLine(a.MedicineId, a.BatchNo, a.Quantity, a.CostPrice))
                    .ToList(),
                ReceivedOnUtc: transfer.ReceivedAtUtc ?? DateTime.UtcNow),
                cancellationToken).ConfigureAwait(false);
        }

        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return transfer.Id;
    }

    private async Task EnsureCallerIsAtDestinationAsync(StockTransfer transfer, CancellationToken cancellationToken)
    {
        if (await currentBranch.CanViewAllBranchesAsync(cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        Guid? callerBranchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (callerBranchId != transfer.ToBranchId)
        {
            throw new ForbiddenException("Only the destination branch can receive this transfer.");
        }
    }
}
