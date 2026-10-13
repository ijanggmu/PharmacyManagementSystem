using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.SearchStockCountSessions;

public sealed class SearchStockCountSessionsQueryHandler(InventoryDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchStockCountSessionsQuery, PagedResponse<StockCountSessionDto>>
{
    public async ValueTask<PagedResponse<StockCountSessionDto>> Handle(SearchStockCountSessionsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var sessions = dbContext.StockCountSessions.AsNoTracking();
        if (await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false) is { } branchId)
        {
            sessions = sessions.Where(s => s.BranchId == branchId);
        }

        if (!string.IsNullOrWhiteSpace(query.Status) && Enum.TryParse<StockCountStatus>(query.Status, true, out var status))
        {
            sessions = sessions.Where(s => s.Status == status);
        }

        long total = await sessions.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var page = await sessions
            .OrderByDescending(s => s.CreatedAtUtc)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var ids = page.Select(s => s.Id).ToList();
        var counts = await dbContext.StockCountLines.AsNoTracking()
            .Where(l => ids.Contains(l.SessionId))
            .GroupBy(l => l.SessionId)
            .Select(g => new { SessionId = g.Key, Lines = g.Count(), Counted = g.Count(l => l.CountedQuantity != null) })
            .ToDictionaryAsync(x => x.SessionId, cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<StockCountSessionDto>
        {
            Items = page
                .Select(s => StockCountMapper.ToDto(
                    s,
                    counts.TryGetValue(s.Id, out var c) ? c.Lines : 0,
                    counts.TryGetValue(s.Id, out var c2) ? c2.Counted : 0))
                .ToList(),
            PageNumber = query.PageNumber,
            PageSize = query.PageSize,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)query.PageSize),
        };
    }
}
