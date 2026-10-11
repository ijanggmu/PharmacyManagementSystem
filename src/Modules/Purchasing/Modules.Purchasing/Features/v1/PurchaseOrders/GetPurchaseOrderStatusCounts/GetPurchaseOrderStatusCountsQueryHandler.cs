using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderStatusCounts;

public sealed class GetPurchaseOrderStatusCountsQueryHandler(PurchasingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetPurchaseOrderStatusCountsQuery, PurchaseOrderStatusCountsDto>
{
    public async ValueTask<PurchaseOrderStatusCountsDto> Handle(GetPurchaseOrderStatusCountsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var orders = dbContext.PurchaseOrders.AsNoTracking();
        if (await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false) is { } branchId)
        {
            orders = orders.Where(o => o.BranchId == branchId || o.BranchId == null);
        }

        var counts = await orders
            .GroupBy(o => o.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int CountOf(PurchaseOrderStatus status) => counts.FirstOrDefault(c => c.Status == status)?.Count ?? 0;

        return new PurchaseOrderStatusCountsDto(
            counts.Sum(c => c.Count),
            CountOf(PurchaseOrderStatus.Draft),
            CountOf(PurchaseOrderStatus.Approved),
            CountOf(PurchaseOrderStatus.Received),
            CountOf(PurchaseOrderStatus.Cancelled));
    }
}
