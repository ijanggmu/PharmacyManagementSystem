using System.Data;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Batches.UpdateBatchSellingPrice;

/// <summary>
/// Gives one lot its own selling price. The lot is locked (<c>FOR UPDATE</c>) and re-read first, so a sale
/// drawing from it either sees the old price or the new one, never a half-written row. A disposed lot can't be
/// re-priced. Callers confined to one branch can only price that branch's lots. Pricing a lot below its cost needs a
/// manager approval bound to the lot, redeemed inside this transaction (<see cref="PriceBelowCostGuard"/>).
/// </summary>
public sealed class UpdateBatchSellingPriceCommandHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    IApprovalService approvals)
    : ICommandHandler<UpdateBatchSellingPriceCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateBatchSellingPriceCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        string notFound = $"Batch {command.BatchId} not found.";
        var batch = (await InventoryRowLocks.LockBatchesAsync(dbContext, [command.BatchId], cancellationToken).ConfigureAwait(false))
            .FirstOrDefault()
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(batch.BranchId, notFound, cancellationToken).ConfigureAwait(false);

        if (batch.IsDisposed)
        {
            throw new CustomException(
                $"Batch {batch.BatchNo} has been disposed; it can't be re-priced.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (command.SellingPrice != batch.SellingPrice)
        {
            await PriceBelowCostGuard.EnsureAllowedAsync(
                approvals, command.SellingPrice, batch.CostPrice, batch.Id, $"lot {batch.BatchNo}", command.ApprovalTokens, cancellationToken)
                .ConfigureAwait(false);
        }

        batch.ChangeSellingPrice(command.SellingPrice);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return batch.Id;
    }
}
