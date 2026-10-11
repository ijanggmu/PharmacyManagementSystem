using System.Data;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CancelPurchaseOrder;

/// <summary>Cancels a draft or approved order. The caller must be able to see the order's branch (otherwise
/// it is reported as not found). The order row is locked and re-read first, so a cancel racing a receive
/// either waits for the receive and then fails (already Received) or wins and the receive fails.</summary>
public sealed class CancelPurchaseOrderCommandHandler(PurchasingDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<CancelPurchaseOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelPurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string notFound = $"Purchase order {command.PurchaseOrderId} not found.";

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = dbContext.Database.IsRelational()
                ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken).ConfigureAwait(false)
                : null;

            await PurchasingRowLocks.LockPurchaseOrderAsync(dbContext, command.PurchaseOrderId, cancellationToken).ConfigureAwait(false);

            var order = await dbContext.PurchaseOrders
                .FirstOrDefaultAsync(o => o.Id == command.PurchaseOrderId, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new NotFoundException(notFound);
            await currentBranch.EnsureCanSeeBranchAsync(order.BranchId, notFound, cancellationToken).ConfigureAwait(false);

            order.Cancel(command.Reason);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            }

            return order.Id;
        }).ConfigureAwait(false);
    }
}
