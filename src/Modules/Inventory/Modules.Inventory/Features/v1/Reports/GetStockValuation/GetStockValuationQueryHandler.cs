using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetStockValuation;

public sealed class GetStockValuationQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetStockValuationQuery, decimal>
{
    public async ValueTask<decimal> Handle(GetStockValuationQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        // Confined like every list/report: a pinned caller only ever values their own branch.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        return await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => !b.IsDisposed && (branchId == null || b.BranchId == branchId))
            .SumAsync(b => b.QuantityOnHand * b.CostPrice, cancellationToken)
            .ConfigureAwait(false);
    }
}
