using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Reports;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetDeadStock;

/// <summary>
/// .NET port of the Next.js reference's <c>getDeadStockReport</c>
/// (lib/server/services/reports-service.ts) — medicines with on-hand stock (sum of non-disposed
/// batch quantities) but no completed sale in <c>SinceDays</c>. Last-sold dates come from Sales via
/// <see cref="GetLastSaleDatesForMedicinesQuery"/> (Mediator, Contracts-only) rather than a direct
/// cross-module DbContext join.
///
/// The last-sold join against Sales (Contracts-only, no cross-module DbContext access) can't be
/// pushed into SQL, so candidate rows are materialised and filtered in memory before paging — same
/// in-memory-then-page shape as <c>SearchMedicinesQueryHandler</c> uses when its filters need batch
/// aggregates.
/// </summary>
public sealed class GetDeadStockQueryHandler(InventoryDbContext dbContext, IMediator mediator, TimeProvider timeProvider, ICurrentBranch currentBranch)
    : IQueryHandler<GetDeadStockQuery, PagedResponse<DeadStockRowDto>>
{
    public async ValueTask<PagedResponse<DeadStockRowDto>> Handle(GetDeadStockQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var cutoff = now.AddDays(-Math.Max(query.SinceDays, 0));

        // Judged per branch when one is selected (or the caller is pinned): stock idle at this branch is
        // dead here even if another branch sells it.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var stocked = await (
            from m in dbContext.Medicines.AsNoTracking()
            where !m.IsDeleted
            let onHand = dbContext.MedicineBatches
                .Where(b => b.MedicineId == m.Id && !b.IsDisposed && (branchId == null || b.BranchId == branchId))
                .Sum(b => (decimal?)b.QuantityOnHand) ?? 0m
            where onHand > 0
            select new
            {
                m.Id,
                m.Name,
                OnHand = onHand,
                // Weighted-average cost across remaining on-hand batches — a stable, explainable
                // valuation basis (mirrors GetStockValuationQueryHandler's per-batch cost approach).
                Value = dbContext.MedicineBatches
                    .Where(b => b.MedicineId == m.Id && !b.IsDisposed && (branchId == null || b.BranchId == branchId))
                    .Sum(b => (decimal?)(b.QuantityOnHand * b.CostPrice)) ?? 0m,
                NearestExpiry = dbContext.MedicineBatches
                    .Where(b => b.MedicineId == m.Id && !b.IsDisposed && b.QuantityOnHand > 0 && (branchId == null || b.BranchId == branchId))
                    .OrderBy(b => b.ExpiryDate)
                    .Select(b => (DateOnly?)b.ExpiryDate)
                    .FirstOrDefault(),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (stocked.Count == 0)
        {
            return new PagedResponse<DeadStockRowDto>
            {
                Items = [],
                PageNumber = page,
                PageSize = size,
                TotalCount = 0,
                TotalPages = 0,
            };
        }

        var lastSoldByMedicine = await mediator
            .Send(new GetLastSaleDatesForMedicinesQuery(stocked.Select(s => s.Id).ToList(), branchId), cancellationToken)
            .ConfigureAwait(false);

        var filtered = stocked
            .Select(s =>
            {
                lastSoldByMedicine.TryGetValue(s.Id, out var lastSold);
                return new DeadStockRowDto(
                    s.Id, s.Name, s.OnHand, s.Value,
                    lastSold == default ? null : lastSold,
                    s.NearestExpiry,
                    branchId);
            })
            .Where(r => r.LastSoldAtUtc is null || r.LastSoldAtUtc < cutoff)
            .OrderByDescending(r => r.InventoryValue)
            .ToList();

        int totalCount = filtered.Count;
        var pageItems = filtered
            .Skip((page - 1) * size)
            .Take(size)
            .ToList();

        return new PagedResponse<DeadStockRowDto>
        {
            Items = pageItems,
            PageNumber = page,
            PageSize = size,
            TotalCount = totalCount,
            TotalPages = (int)Math.Ceiling(totalCount / (double)size),
        };
    }
}
