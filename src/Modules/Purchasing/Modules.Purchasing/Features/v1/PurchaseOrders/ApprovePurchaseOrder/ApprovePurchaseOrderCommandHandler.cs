using System.Data;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Services;
using FSH.Modules.Reference.Contracts.Controls;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ApprovePurchaseOrder;

/// <summary>Approves a draft order. The caller must be able to see the order's branch (otherwise it is
/// reported as not found); the order row is locked so an approve cannot race a cancel. With the tenant's
/// <see cref="InternalControlSettings.PoSecondApproverKey"/> control on, the user who raised the order can't approve
/// it (403) — someone else holding Approve must.</summary>
public sealed class ApprovePurchaseOrderCommandHandler(
    PurchasingDbContext dbContext, ICurrentUser currentUser, ICurrentBranch currentBranch, IMediator mediator)
    : ICommandHandler<ApprovePurchaseOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(ApprovePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string notFound = $"Purchase order {command.PurchaseOrderId} not found.";
        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();

        // Read before the transaction opens: the settings live in another module.
        var stored = await mediator.Send(new GetTenantSettingsQuery(InternalControlSettings.Category), cancellationToken)
            .ConfigureAwait(false);
        bool secondApprover = InternalControlSettings.From(stored).PoSecondApprover;

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

            if (secondApprover && order.Status == PurchaseOrderStatus.Draft)
            {
                order.EnsureApproverIsNotCreator(currentUser.GetUserId().ToString());
            }

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
