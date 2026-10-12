using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetSupplierReceivedLots;

/// <summary>In-process: the lots a supplier's non-voided direct receipts put the medicine into, and whether any
/// of its receipts of that medicine (received purchase orders, or direct receipts with no recorded lot) leave the
/// lot unknown.</summary>
public sealed class GetSupplierReceivedLotsQueryHandler(PurchasingDbContext dbContext)
    : IQueryHandler<GetSupplierReceivedLotsQuery, SupplierReceivedLotsDto>
{
    public async ValueTask<SupplierReceivedLotsDto> Handle(GetSupplierReceivedLotsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var receiptLots = await (
            from line in dbContext.DirectGoodsReceiptLines.AsNoTracking()
            join receipt in dbContext.DirectGoodsReceipts.AsNoTracking() on line.DirectGoodsReceiptId equals receipt.Id
            where receipt.SupplierId == query.SupplierId
                && receipt.Status == DirectGoodsReceiptStatus.Received
                && line.MedicineId == query.MedicineId
            select line.BatchId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Purchase-order lines don't record the lot the stock went into.
        bool viaOrders = await (
            from line in dbContext.PurchaseOrderLines.AsNoTracking()
            join order in dbContext.PurchaseOrders.AsNoTracking() on line.PurchaseOrderId equals order.Id
            where order.SupplierId == query.SupplierId
                && order.Status == PurchaseOrderStatus.Received
                && line.MedicineId == query.MedicineId
            select line.Id)
            .AnyAsync(cancellationToken)
            .ConfigureAwait(false);

        return new SupplierReceivedLotsDto(
            receiptLots.Where(id => id.HasValue).Select(id => id!.Value).Distinct().ToList(),
            HasUntrackedReceipts: viaOrders || receiptLots.Any(id => !id.HasValue));
    }
}
