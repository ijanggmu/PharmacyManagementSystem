using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.SearchStockTransfers;

public sealed class SearchStockTransfersQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchStockTransfersQuery, PagedResponse<StockTransferDto>>
{
    public async ValueTask<PagedResponse<StockTransferDto>> Handle(
        SearchStockTransfersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 20 : query.PageSize;

        var q = dbContext.StockTransfers.AsNoTracking().Include(t => t.Items).AsQueryable();

        if (query.LocationId is { } locationId)
        {
            q = q.Where(t => t.FromLocationId == locationId || t.ToLocationId == locationId);
        }

        // Branch-required entity: an omitted branchId defaults to the current branch (explicit wins).
        // A null current branch (no tenant / operator call) leaves the query unfiltered.
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(t => t.FromBranchId == scopedBranchId || t.ToBranchId == scopedBranchId);
        }

        // The validator rejects unknown values, so a non-empty filter always parses here.
        if (StockTransferStatusFilter.TryParse(query.Status, out var status))
        {
            q = q.Where(t => t.Status == status);
        }

        q = q.OrderByDescending(t => t.CreatedAtUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var transfers = await q.Skip((page - 1) * size).Take(size)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var medicineIds = transfers.SelectMany(t => t.Items.Select(i => i.MedicineId)).Distinct().ToList();
        var medicineNames = await dbContext.Medicines.AsNoTracking()
            .Where(m => medicineIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.Name, cancellationToken)
            .ConfigureAwait(false);

        var items = transfers.Select(t => new StockTransferDto(
            t.Id, t.TransferNumber, t.FromLocationId, t.ToLocationId, t.FromBranchId, t.ToBranchId, t.Status.ToString(), t.Notes,
            t.CreatedAtUtc, t.ReceivedAtUtc, t.CancelledAtUtc, t.CancellationReason,
            t.Items.Select(i => new StockTransferItemDto(
                i.MedicineId, medicineNames.GetValueOrDefault(i.MedicineId), i.Quantity)).ToList()))
            .ToList();

        return new PagedResponse<StockTransferDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
