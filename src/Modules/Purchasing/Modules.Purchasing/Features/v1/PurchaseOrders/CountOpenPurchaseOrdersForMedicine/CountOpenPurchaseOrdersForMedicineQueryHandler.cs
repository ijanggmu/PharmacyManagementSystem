using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CountOpenPurchaseOrdersForMedicine;

public sealed class CountOpenPurchaseOrdersForMedicineQueryHandler(PurchasingDbContext dbContext)
    : IQueryHandler<CountOpenPurchaseOrdersForMedicineQuery, int>
{
    public async ValueTask<int> Handle(CountOpenPurchaseOrdersForMedicineQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        return await (
                from line in dbContext.PurchaseOrderLines.AsNoTracking()
                join order in dbContext.PurchaseOrders.AsNoTracking() on line.PurchaseOrderId equals order.Id
                where line.MedicineId == query.MedicineId
                    && (order.Status == PurchaseOrderStatus.Draft || order.Status == PurchaseOrderStatus.Approved)
                select order.Id)
            .Distinct()
            .CountAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}
