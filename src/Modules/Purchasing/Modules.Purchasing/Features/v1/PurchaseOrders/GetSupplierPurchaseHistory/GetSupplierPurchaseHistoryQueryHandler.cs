using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetSupplierPurchaseHistory;

public sealed class GetSupplierPurchaseHistoryQueryHandler(PurchasingDbContext dbContext)
    : IQueryHandler<GetSupplierPurchaseHistoryQuery, IReadOnlyList<PurchaseLineHistoryDto>>
{
    public async ValueTask<IReadOnlyList<PurchaseLineHistoryDto>> Handle(
        GetSupplierPurchaseHistoryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int limit = query.Limit is < 1 or > 1000 ? 200 : query.Limit;

        var rows = await (
            from line in dbContext.PurchaseOrderLines.AsNoTracking()
            join order in dbContext.PurchaseOrders.AsNoTracking() on line.PurchaseOrderId equals order.Id
            where order.SupplierId == query.SupplierId && order.Status == PurchaseOrderStatus.Received
            orderby order.ReceivedAtUtc descending
            select new PurchaseLineHistoryDto(
                line.MedicineId,
                order.ReceivedAtUtc ?? order.OrderDateUtc,
                line.UnitCostPrice,
                line.Quantity))
            .Take(limit)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows;
    }
}
