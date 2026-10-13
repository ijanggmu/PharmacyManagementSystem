using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Consignment.ListConsignmentSettlements;

public sealed class ListConsignmentSettlementsQueryHandler(InventoryDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<ListConsignmentSettlementsQuery, PagedResponse<ConsignmentSettlementDto>>
{
    public async ValueTask<PagedResponse<ConsignmentSettlementDto>> Handle(ListConsignmentSettlementsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.ConsignmentSettlements.AsNoTracking().AsQueryable();
        if (await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false) is { } branchId)
        {
            q = q.Where(s => s.BranchId == branchId);
        }
        if (query.SupplierId is { } supplierId)
        {
            q = q.Where(s => s.SupplierId == supplierId);
        }

        var ordered = q.OrderByDescending(s => s.CreatedAtUtc).ThenBy(s => s.Id);

        long totalCount = await ordered.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var rows = await ordered
            .Skip((page - 1) * size)
            .Take(size)
            .Select(s => new ConsignmentSettlementDto(
                s.Id, s.SupplierId, s.BranchId, s.TotalAmount, s.PositionsSettledCount,
                s.SettlementDateUtc, s.SettledBy, s.CreatedAtUtc, null, s.VatAmount))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var names = await SupplierNameResolver
            .ResolveAsync(mediator, rows.Select(r => r.SupplierId), cancellationToken)
            .ConfigureAwait(false);

        var items = rows
            .Select(r => r with { SupplierName = names.TryGetValue(r.SupplierId, out var name) ? name : null })
            .ToList();

        return new PagedResponse<ConsignmentSettlementDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = totalCount,
            TotalPages = (int)Math.Ceiling(totalCount / (double)size),
        };
    }
}
