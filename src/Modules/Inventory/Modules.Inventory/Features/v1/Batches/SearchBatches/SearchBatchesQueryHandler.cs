using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Batches.SearchBatches;

public sealed class SearchBatchesQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch, IMediator mediator)
    : IQueryHandler<SearchBatchesQuery, PagedResponse<MedicineBatchDto>>
{
    public async ValueTask<PagedResponse<MedicineBatchDto>> Handle(SearchBatchesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q =
            from b in dbContext.MedicineBatches.AsNoTracking()
            join m in dbContext.Medicines.AsNoTracking() on b.MedicineId equals m.Id
            select new { Batch = b, Medicine = m };

        if (query.MedicineId is { } medicineId)
        {
            q = q.Where(x => x.Batch.MedicineId == medicineId);
        }

        // Branch-required entity: an omitted branchId defaults to the current branch (explicit wins).
        // A null current branch (no tenant / operator call) leaves the query unfiltered.
        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            q = q.Where(x => x.Batch.BranchId == scopedBranchId);
        }

        if (query.ExcludeRecalled == true)
        {
            q = q.Where(x => !x.Batch.IsRecalled);
        }

        if (query.IncludeDisposed != true)
        {
            q = q.Where(x => !x.Batch.IsDisposed);
        }

        if (query.ExpiringBeforeUtc is { } expiringBefore)
        {
            q = q.Where(x => x.Batch.ExpiryDate <= expiringBefore);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim();
            q = q.Where(x =>
                EF.Functions.ILike(x.Batch.BatchNo, $"%{term}%") ||
                EF.Functions.ILike(x.Medicine.Name, $"%{term}%"));
        }

        // Total order so FEFO ties (same expiry) are stable across pages: expiry, then receipt time, then id.
        q = q.OrderBy(x => x.Batch.ExpiryDate)
            .ThenBy(x => x.Batch.CreatedAtUtc)
            .ThenBy(x => x.Batch.Id);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var branchNames = await BatchBranchNameResolver
            .ResolveAsync(mediator, items.Select(x => x.Batch.BranchId), cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<MedicineBatchDto>
        {
            Items = items
                .Select(x => new MedicineBatchDto(
                    x.Batch.Id, x.Batch.MedicineId, x.Medicine.Name, x.Batch.BranchId, x.Batch.BatchNo, x.Batch.ExpiryDate,
                    x.Batch.QuantityOnHand, x.Batch.CostPrice, x.Batch.SellingPrice, x.Batch.RackLocation,
                    x.Batch.IsDisposed, x.Batch.CreatedAtUtc, x.Batch.UpdatedAtUtc,
                    x.Batch.IsRecalled, x.Batch.RecalledAtUtc, x.Batch.RecallReason,
                    branchNames.TryGetValue(x.Batch.BranchId, out var branchName) ? branchName : null,
                    x.Batch.InitialQuantity ?? x.Batch.QuantityOnHand))
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }
}
