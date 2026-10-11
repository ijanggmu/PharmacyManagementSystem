using System.Data;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ApprovePurchaseOrder;

/// <summary>Approves a draft order. The caller must be able to see the order's branch (otherwise it is
/// reported as not found); the order row is locked so an approve cannot race a cancel.</summary>
public sealed class ApprovePurchaseOrderCommandHandler(
    PurchasingDbContext dbContext, ICurrentUser currentUser, ICurrentBranch currentBranch)
    : ICommandHandler<ApprovePurchaseOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(ApprovePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string notFound = $"Purchase order {command.PurchaseOrderId} not found.";
        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();

        var strategy = dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = dbContext.Database.IsRelational()
                ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken).ConfigureAwait(false)
                : null;

            await PurchasingRowLocks.LockPurchaseOrderAsync(dbContext, command.PurchaseOrderId, cancellationToken).ConfigureAwait(false);

            var order = await dbContext.PurchaseOrders
                .Include(o => o.Lines)
                .FirstOrDefaultAsync(o => o.Id == command.PurchaseOrderId, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new NotFoundException(notFound);
            await currentBranch.EnsureCanSeeBranchAsync(order.BranchId, notFound, cancellationToken).ConfigureAwait(false);

            order.Approve(actor);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
            }

            return order.Id;
        }).ConfigureAwait(false);
    }
}
