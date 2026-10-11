using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ApprovePurchaseOrder;

public sealed class ApprovePurchaseOrderCommandHandler(PurchasingDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<ApprovePurchaseOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(ApprovePurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var order = await dbContext.PurchaseOrders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == command.PurchaseOrderId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Purchase order {command.PurchaseOrderId} not found.");

        order.Approve(currentUser.Name ?? currentUser.GetUserId().ToString());
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return order.Id;
    }
}
