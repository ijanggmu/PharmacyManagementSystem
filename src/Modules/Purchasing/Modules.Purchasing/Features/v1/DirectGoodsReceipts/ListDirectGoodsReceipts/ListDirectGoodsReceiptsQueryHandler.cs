using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.GetDirectGoodsReceiptById;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;

/// <summary>Mirrors listDirectGoodsReceipts's ordering (receipt date desc, then created-at desc) and
/// its 100-row cap (lib/server/services/inventory-supplier-receipt-service.ts). Branch-required entity:
/// an omitted branchId defaults to the current branch (docs/branch-scoping-plan.md §2).</summary>
public sealed class ListDirectGoodsReceiptsQueryHandler(
    PurchasingDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : IQueryHandler<ListDirectGoodsReceiptsQuery, IReadOnlyList<DirectGoodsReceiptDto>>
{
    private const int MaxRows = 100;

    public async ValueTask<IReadOnlyList<DirectGoodsReceiptDto>> Handle(ListDirectGoodsReceiptsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var receiptsQuery = dbContext.DirectGoodsReceipts.AsNoTracking().Include(r => r.Lines).AsQueryable();

        // An explicit branchId wins; otherwise default to the current branch. A null current branch
        // (no tenant / operator call) leaves the query unfiltered.
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            receiptsQuery = receiptsQuery.Where(r => r.BranchId == scopedBranchId);
        }

        var receipts = await receiptsQuery
            .OrderByDescending(r => r.ReceiptDateUtc)
            .ThenByDescending(r => r.CreatedAtUtc)
            .Take(MaxRows)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var names = await GetDirectGoodsReceiptByIdQueryHandler.LoadNamesAsync(mediator, receipts, cancellationToken)
            .ConfigureAwait(false);
        return receipts.Select(r => GetDirectGoodsReceiptByIdQueryHandler.Map(r, names)).ToList();
    }
}
