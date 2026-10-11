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

        // Each source is capped at the limit on its own, then the two are merged newest first and capped again.
        var orderRows = await (
            from line in dbContext.PurchaseOrderLines.AsNoTracking()
            join order in dbContext.PurchaseOrders.AsNoTracking() on line.PurchaseOrderId equals order.Id
            where order.SupplierId == query.SupplierId && order.Status == PurchaseOrderStatus.Received
            orderby (order.ReceivedAtUtc ?? order.OrderDateUtc) descending
            select new PurchaseLineHistoryDto(
                line.MedicineId,
                order.ReceivedAtUtc ?? order.OrderDateUtc,
                line.UnitCostPrice,
                line.Quantity))
            .Take(limit)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var directRows = await (
            from line in dbContext.DirectGoodsReceiptLines.AsNoTracking()
            join receipt in dbContext.DirectGoodsReceipts.AsNoTracking() on line.DirectGoodsReceiptId equals receipt.Id
            where receipt.SupplierId == query.SupplierId && receipt.Status == DirectGoodsReceiptStatus.Received
            orderby receipt.ReceiptDateUtc descending
            select new PurchaseLineHistoryDto(
                line.MedicineId,
                receipt.ReceiptDateUtc,
                line.UnitCostPrice,
                line.Quantity))
            .Take(limit)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return orderRows
            .Concat(directRows)
            .OrderByDescending(r => r.ReceiptDateUtc)
            .Take(limit)
            .ToList();
    }
}
