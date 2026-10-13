using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales;

/// <summary>
/// Units per sale line already on non-rejected returns and refunds (soft-deleted ones are hidden by the query
/// filter), the same consumption the return/refund caps check against. Keyed by sale line id. Shared by the sale
/// detail and the sales list, so the list can tell when a sale has nothing left to return.
/// </summary>
internal static class SaleReversedQuantities
{
    public static async Task<Dictionary<Guid, (decimal Returned, decimal Refunded)>> LoadAsync(
        SalesDbContext dbContext, IReadOnlyCollection<Guid> saleIds, CancellationToken cancellationToken)
    {
        var result = new Dictionary<Guid, (decimal Returned, decimal Refunded)>();
        if (saleIds.Count == 0)
        {
            return result;
        }

        var returned = await (
            from ri in dbContext.SaleReturnItems
            join sr in dbContext.SaleReturns on ri.SaleReturnId equals sr.Id
            where saleIds.Contains(sr.SaleId) && sr.Status != ReturnStatus.Rejected
            group ri by ri.SaleItemId into g
            select new { SaleItemId = g.Key, Quantity = g.Sum(x => x.QuantityReturned) })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var refunded = await (
            from ri in dbContext.SaleRefundItems
            join sr in dbContext.SaleRefunds on ri.SaleRefundId equals sr.Id
            where saleIds.Contains(sr.OriginalSaleId) && sr.Status != RefundStatus.Rejected
            group ri by ri.SaleItemId into g
            select new { SaleItemId = g.Key, Quantity = g.Sum(x => x.QuantityRefunded) })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        foreach (var r in returned)
        {
            result[r.SaleItemId] = (r.Quantity, 0m);
        }

        foreach (var r in refunded)
        {
            var current = result.GetValueOrDefault(r.SaleItemId);
            result[r.SaleItemId] = (current.Returned, r.Quantity);
        }

        return result;
    }
}
