using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetSupplierReceivedQuantity;

public sealed class GetSupplierReceivedQuantityQueryHandler(PurchasingDbContext dbContext)
    : IQueryHandler<GetSupplierReceivedQuantityQuery, decimal>
{
    public async ValueTask<decimal> Handle(GetSupplierReceivedQuantityQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        decimal viaOrders = await (
            from line in dbContext.PurchaseOrderLines.AsNoTracking()
            join order in dbContext.PurchaseOrders.AsNoTracking() on line.PurchaseOrderId equals order.Id
            where order.SupplierId == query.SupplierId
                && order.Status == PurchaseOrderStatus.Received
                && line.MedicineId == query.MedicineId
            select line.Quantity)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);

        // Stock booked straight off a supplier bill (no purchase order) was received from them too; a voided
        // receipt's stock went back out, so it doesn't count.
        decimal viaDirectReceipts = await (
            from line in dbContext.DirectGoodsReceiptLines.AsNoTracking()
            join receipt in dbContext.DirectGoodsReceipts.AsNoTracking() on line.DirectGoodsReceiptId equals receipt.Id
            where receipt.SupplierId == query.SupplierId
                && receipt.Status == DirectGoodsReceiptStatus.Received
                && line.MedicineId == query.MedicineId
            select line.Quantity)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);

        return viaOrders + viaDirectReceipts;
    }
}
