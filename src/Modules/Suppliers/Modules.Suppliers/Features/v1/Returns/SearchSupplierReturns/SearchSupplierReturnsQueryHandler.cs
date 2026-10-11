using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Features.v1.Returns;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Returns.SearchSupplierReturns;

public sealed class SearchSupplierReturnsQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchSupplierReturnsQuery, PagedResponse<SupplierReturnDto>>
{
    public async ValueTask<PagedResponse<SupplierReturnDto>> Handle(
        SearchSupplierReturnsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.SupplierReturns.AsNoTracking().Include(r => r.Items).AsQueryable();

        if (query.SupplierId is { } supplierId)
        {
            q = q.Where(r => r.SupplierId == supplierId);
        }

        if (branchFilter is { } branchId)
        {
            q = q.Where(r => r.BranchId == branchId);
        }

        q = q.OrderByDescending(r => r.ReturnDateUtc).ThenByDescending(r => r.CreatedAtUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var supplierIds = items.Select(r => r.SupplierId).Distinct().ToList();
        var names = await dbContext.Suppliers.AsNoTracking()
            .IgnoreQueryFilters([FSH.Framework.Persistence.QueryFilters.SoftDelete])
            .Where(s => supplierIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<SupplierReturnDto>
        {
            Items = items.Select(r => r.ToDto(names.GetValueOrDefault(r.SupplierId))).ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
