using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetExpiredBatches;

public sealed class GetExpiredBatchesQueryHandler(InventoryDbContext dbContext, TimeProvider timeProvider, ICurrentBranch currentBranch)
    : IQueryHandler<GetExpiredBatchesQuery, PagedResponse<ExpiredBatchDto>>
{
    public async ValueTask<PagedResponse<ExpiredBatchDto>> Handle(GetExpiredBatchesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var today = NepalClock.Today(timeProvider);

        // Ordering/paging stay on the raw entity columns (not the projected DTO below) — EF Core
        // re-inlines a record constructor into the SQL when ORDER BY references a property of an
        // already-projected DTO, which Npgsql cannot translate.
        // isRecalled=true is the recall list: every recalled lot still on hand, expired or not (a recalled lot that
        // hasn't expired yet must be found and pulled too).
        bool recallList = query.IsRecalled is true;
        var batchesQuery =
            from b in dbContext.MedicineBatches.AsNoTracking()
            join m in dbContext.Medicines.AsNoTracking() on b.MedicineId equals m.Id
            where !b.IsDisposed && b.QuantityOnHand > 0 && (recallList || b.ExpiryDate < today)
            select new { Batch = b, MedicineName = m.Name };

        if (await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false) is { } branchId)
        {
            batchesQuery = batchesQuery.Where(x => x.Batch.BranchId == branchId);
        }

        // Optional filter: isolate recalled-and-expired batches from ordinary expiries (or vice versa)
        // instead of lumping both under one undifferentiated list.
        if (query.IsRecalled is bool isRecalled)
        {
            batchesQuery = batchesQuery.Where(x => x.Batch.IsRecalled == isRecalled);
        }

        var ordered = batchesQuery.OrderBy(x => x.Batch.ExpiryDate).ThenBy(x => x.Batch.Id);

        long totalCount = await ordered.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var pageItems = await ordered
            .Skip((page - 1) * size)
            .Take(size)
            .Select(x => new ExpiredBatchDto(
                x.Batch.Id, x.Batch.MedicineId, x.MedicineName, x.Batch.BatchNo, x.Batch.ExpiryDate, x.Batch.QuantityOnHand,
                x.Batch.CostPrice, x.Batch.CreatedAtUtc, x.Batch.BranchId, x.Batch.RackLocation, x.Batch.IsRecalled))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<ExpiredBatchDto>
        {
            Items = pageItems,
            PageNumber = page,
            PageSize = size,
            TotalCount = totalCount,
            TotalPages = (int)Math.Ceiling(totalCount / (double)size),
        };
    }
}
