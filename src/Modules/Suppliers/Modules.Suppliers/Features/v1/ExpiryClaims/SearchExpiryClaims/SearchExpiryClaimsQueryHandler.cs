using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.SearchExpiryClaims;

public sealed class SearchExpiryClaimsQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchExpiryClaimsQuery, PagedResponse<ExpiryClaimDto>>
{
    public async ValueTask<PagedResponse<ExpiryClaimDto>> Handle(SearchExpiryClaimsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var claims = dbContext.ExpiryClaims.AsNoTracking();
        if (await currentBranch.GetListFilterBranchIdAsync(cancellationToken).ConfigureAwait(false) is { } branchId)
        {
            claims = claims.Where(c => c.BranchId == null || c.BranchId == branchId);
        }

        if (query.SupplierId is { } supplierId)
        {
            claims = claims.Where(c => c.SupplierId == supplierId);
        }

        if (!string.IsNullOrWhiteSpace(query.Status) && Enum.TryParse<ExpiryClaimStatus>(query.Status, true, out var status))
        {
            claims = claims.Where(c => c.Status == status);
        }

        long total = await claims.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var page = await claims
            .Include(c => c.Lines)
            .OrderByDescending(c => c.CreatedAtUtc)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var supplierIds = page.Select(c => c.SupplierId).Distinct().ToList();
        var names = await dbContext.Suppliers.IgnoreQueryFilters([QueryFilters.SoftDelete]).AsNoTracking()
            .Where(s => supplierIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => s.Name, cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<ExpiryClaimDto>
        {
            Items = page.Select(c => ExpiryClaimMapper.ToDto(c, names.GetValueOrDefault(c.SupplierId), includeLines: false)).ToList(),
            PageNumber = query.PageNumber,
            PageSize = query.PageSize,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)query.PageSize),
        };
    }
}
