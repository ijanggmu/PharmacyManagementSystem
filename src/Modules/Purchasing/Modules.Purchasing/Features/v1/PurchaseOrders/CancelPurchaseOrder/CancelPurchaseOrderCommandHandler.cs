using FSH.Framework.Core.Exceptions;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CancelPurchaseOrder;

public sealed class CancelPurchaseOrderCommandHandler(PurchasingDbContext dbContext)
    : ICommandHandler<CancelPurchaseOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(CancelPurchaseOrderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var order = await dbContext.PurchaseOrders
            .FirstOrDefaultAsync(o => o.Id == command.PurchaseOrderId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Purchase order {command.PurchaseOrderId} not found.");

        order.Cancel(command.Reason);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return order.Id;
    }
}
