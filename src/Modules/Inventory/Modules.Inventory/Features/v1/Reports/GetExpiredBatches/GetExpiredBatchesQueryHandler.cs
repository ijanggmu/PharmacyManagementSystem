using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetExpiredBatches;

public sealed class GetExpiredBatchesQueryHandler(
    InventoryDbContext dbContext, TimeProvider timeProvider, ICurrentBranch currentBranch, IMediator mediator)
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
        // Every lot blocked from sale that needs a decision: expired, or recalled (a recalled lot that hasn't expired
        // yet must be found and pulled too). isRecalled then narrows to one side; null keeps the union, so "all"
        // and "recalled only" agree on which recalled lots exist.
        var batchesQuery =
            from b in dbContext.MedicineBatches.AsNoTracking()
            join m in dbContext.Medicines.AsNoTracking() on b.MedicineId equals m.Id
            where !b.IsDisposed && b.QuantityOnHand > 0 && (b.IsRecalled || b.ExpiryDate < today)
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
                x.Batch.CostPrice, x.Batch.CreatedAtUtc, x.Batch.BranchId, x.Batch.RackLocation, x.Batch.IsRecalled,
                x.Batch.ExpiryDate < today))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Lots the supplier is still being asked to take back (open expiry claims), through the Suppliers contract.
        if (pageItems.Count > 0)
        {
            var onClaim = await mediator.Send(
                    new GetOpenExpiryClaimQuantitiesQuery(pageItems.Select(i => i.BatchId).ToList()), cancellationToken)
                .ConfigureAwait(false);
            if (onClaim is { Count: > 0 })
            {
                pageItems = pageItems
                    .Select(i => onClaim.TryGetValue(i.BatchId, out decimal held) ? i with { OpenClaimQuantity = held } : i)
                    .ToList();
            }
        }

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
