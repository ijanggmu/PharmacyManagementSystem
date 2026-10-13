using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetLotSuppliers;

/// <summary>In-process: the supplier behind each lot / receipt document (see <see cref="GetLotSuppliersQuery"/>).</summary>
public sealed class GetLotSuppliersQueryHandler(PurchasingDbContext dbContext)
    : IQueryHandler<GetLotSuppliersQuery, LotSuppliersDto>
{
    public async ValueTask<LotSuppliersDto> Handle(GetLotSuppliersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid?[] batchIds = query.BatchIds.Distinct().Select(id => (Guid?)id).ToArray();
        var byBatch = batchIds.Length == 0
            ? []
            : await (
                from line in dbContext.DirectGoodsReceiptLines.AsNoTracking()
                join receipt in dbContext.DirectGoodsReceipts.AsNoTracking() on line.DirectGoodsReceiptId equals receipt.Id
                where receipt.Status == DirectGoodsReceiptStatus.Received && batchIds.Contains(line.BatchId)
                orderby receipt.CreatedAtUtc
                select new { BatchId = line.BatchId!.Value, receipt.SupplierId })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

        var receiptIds = query.ReceiptIds.Distinct().ToList();
        var byReceipt = new Dictionary<Guid, Guid>();
        if (receiptIds.Count > 0)
        {
            var orders = await dbContext.PurchaseOrders.AsNoTracking()
                .Where(o => receiptIds.Contains(o.Id) && o.Status == PurchaseOrderStatus.Received)
                .Select(o => new { o.Id, o.SupplierId })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);
            var receipts = await dbContext.DirectGoodsReceipts.AsNoTracking()
                .Where(r => receiptIds.Contains(r.Id) && r.Status == DirectGoodsReceiptStatus.Received)
                .Select(r => new { r.Id, r.SupplierId })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);
            foreach (var row in orders)
            {
                byReceipt[row.Id] = row.SupplierId;
            }

            foreach (var row in receipts)
            {
                byReceipt[row.Id] = row.SupplierId;
            }
        }

        return new LotSuppliersDto(
            byBatch.GroupBy(r => r.BatchId).ToDictionary(g => g.Key, g => g.First().SupplierId),
            byReceipt);
    }
}
