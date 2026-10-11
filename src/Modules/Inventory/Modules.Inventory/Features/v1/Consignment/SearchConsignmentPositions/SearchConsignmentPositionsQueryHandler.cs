using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Consignment.SearchConsignmentPositions;

/// <summary>
/// <see cref="ConsignmentPositionDto.QuantitySold"/>/<c>AmountOwed</c> depend on the batch's current
/// <c>QuantityOnHand</c>, which can't be expressed as SQL the paging can run against without a
/// materialized subquery — positions per supplier are small in practice (one row per consignment
/// shipment), so this filters/pages in memory after the join instead.
/// </summary>
public sealed class SearchConsignmentPositionsQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchConsignmentPositionsQuery, PagedResponse<ConsignmentPositionDto>>
{
    public async ValueTask<PagedResponse<ConsignmentPositionDto>> Handle(
        SearchConsignmentPositionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q =
            from position in dbContext.ConsignmentPositions.AsNoTracking()
            join batch in dbContext.MedicineBatches.AsNoTracking() on position.BatchId equals batch.Id
            join medicine in dbContext.Medicines.AsNoTracking() on position.MedicineId equals medicine.Id into medicines
            from medicine in medicines.DefaultIfEmpty()
            select new { position, batch.QuantityOnHand, MedicineName = medicine != null ? medicine.GenericName : null };

        if (query.SupplierId is { } supplierId)
        {
            q = q.Where(x => x.position.SupplierId == supplierId);
        }

        if (branchFilter is { } branchId)
        {
            q = q.Where(x => x.position.BranchId == branchId);
        }

        var rows = await q
            .OrderByDescending(x => x.position.ReceivedDateUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var allItems = rows
            .Select(x =>
            {
                decimal quantitySold = x.position.QuantityReceived - x.QuantityOnHand;
                decimal amountOwed = (quantitySold - x.position.SettledQuantity) * x.position.UnitCostPrice;
                return new ConsignmentPositionDto(
                    x.position.Id, x.position.SupplierId, x.position.BranchId, x.position.MedicineId, x.MedicineName,
                    x.position.BatchId, x.position.BatchNo, x.position.QuantityReceived, x.QuantityOnHand,
                    quantitySold, x.position.UnitCostPrice, x.position.SettledQuantity, amountOwed, x.position.ReceivedDateUtc);
            })
            .Where(dto => !query.OnlyOutstanding || dto.AmountOwed > 0)
            .ToList();

        var items = allItems.Skip((page - 1) * size).Take(size).ToList();

        return new PagedResponse<ConsignmentPositionDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = allItems.Count,
            TotalPages = (int)Math.Ceiling(allItems.Count / (double)size),
        };
    }
}
