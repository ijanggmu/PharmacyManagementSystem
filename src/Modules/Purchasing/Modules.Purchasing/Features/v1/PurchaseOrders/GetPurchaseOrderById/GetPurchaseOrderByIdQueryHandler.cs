using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderById;

public sealed class GetPurchaseOrderByIdQueryHandler(PurchasingDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetPurchaseOrderByIdQuery, PurchaseOrderDto>
{
    public async ValueTask<PurchaseOrderDto> Handle(GetPurchaseOrderByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var order = await dbContext.PurchaseOrders
            .AsNoTracking()
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == query.PurchaseOrderId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Purchase order {query.PurchaseOrderId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(order.BranchId, $"Purchase order {query.PurchaseOrderId} not found.", cancellationToken).ConfigureAwait(false);

        var names = await PurchaseOrderMapper.LoadNamesAsync(mediator, [order], cancellationToken).ConfigureAwait(false);
        return PurchaseOrderMapper.ToDto(order, names);
    }
}
