using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetStockValuation;

/// <summary>
/// The stock the pharmacy owns, at cost — the figure the Inventory GL account should hold. Consigned lots are left
/// out (the supplier owns them until they are sold and settled; they were never booked into Inventory), and stock
/// dispatched on a transfer that has not been received yet is counted at the source branch at its transfer cost
/// (the books move it between branches only on receipt).
/// </summary>
public sealed class GetStockValuationQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetStockValuationQuery, decimal>
{
    public async ValueTask<decimal> Handle(GetStockValuationQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        // Confined like every list/report: a pinned caller only ever values their own branch.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        decimal onHand = await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => !b.IsDisposed && (branchId == null || b.BranchId == branchId)
                && !dbContext.ConsignmentPositions.Any(p => p.BatchId == b.Id))
            .SumAsync(b => b.QuantityOnHand * b.CostPrice, cancellationToken)
            .ConfigureAwait(false);

        decimal inTransit = await (
                from lot in dbContext.StockTransferBatches.AsNoTracking()
                join transfer in dbContext.StockTransfers.AsNoTracking() on lot.StockTransferId equals transfer.Id
                where transfer.Status == StockTransferStatus.InTransit
                    && (branchId == null || transfer.FromBranchId == branchId)
                select lot.Quantity * lot.CostPrice)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);

        return onHand + inTransit;
    }
}
