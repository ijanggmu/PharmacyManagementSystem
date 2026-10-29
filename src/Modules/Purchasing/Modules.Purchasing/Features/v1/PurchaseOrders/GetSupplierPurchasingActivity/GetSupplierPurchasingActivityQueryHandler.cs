using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetSupplierPurchasingActivity;

/// <summary>In-process: counts a supplier's approved-but-unreceived orders and its received documents.</summary>
public sealed class GetSupplierPurchasingActivityQueryHandler(PurchasingDbContext dbContext)
    : IQueryHandler<GetSupplierPurchasingActivityQuery, SupplierPurchasingActivityDto>
{
    public async ValueTask<SupplierPurchasingActivityDto> Handle(
        GetSupplierPurchasingActivityQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int openOrders = await dbContext.PurchaseOrders.AsNoTracking()
            .CountAsync(o => o.SupplierId == query.SupplierId && o.Status == PurchaseOrderStatus.Approved, cancellationToken)
            .ConfigureAwait(false);

        int receivedOrders = await dbContext.PurchaseOrders.AsNoTracking()
            .CountAsync(
                o => o.SupplierId == query.SupplierId && o.Status == PurchaseOrderStatus.Received && o.GoodsReceiptId == null,
                cancellationToken)
            .ConfigureAwait(false);

        int directReceipts = await dbContext.DirectGoodsReceipts.AsNoTracking()
            .CountAsync(r => r.SupplierId == query.SupplierId, cancellationToken)
            .ConfigureAwait(false);

        return new SupplierPurchasingActivityDto(openOrders, receivedOrders + directReceipts);
    }
}
