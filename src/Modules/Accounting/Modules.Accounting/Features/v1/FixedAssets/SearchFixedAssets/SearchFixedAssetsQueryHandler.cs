using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.SearchFixedAssets;

/// <summary>The fixed asset register (a pharmacy has tens to a few hundred assets, so it is not paged), active assets
/// first, then by category and name.</summary>
public sealed class SearchFixedAssetsQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchFixedAssetsQuery, IReadOnlyList<FixedAssetDto>>
{
    public async ValueTask<IReadOnlyList<FixedAssetDto>> Handle(SearchFixedAssetsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        var q = dbContext.FixedAssets.AsNoTracking();
        if (branchFilter is { } branchId)
        {
            q = q.Where(a => a.BranchId == branchId);
        }

        if (string.Equals(query.Status, FixedAssetValues.Statuses.Active, StringComparison.OrdinalIgnoreCase))
        {
            q = q.Where(a => !a.IsDisposed);
        }
        else if (string.Equals(query.Status, FixedAssetValues.Statuses.Disposed, StringComparison.OrdinalIgnoreCase))
        {
            q = q.Where(a => a.IsDisposed);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string pattern = $"%{query.Search.Trim()}%";
            q = q.Where(a => EF.Functions.ILike(a.Name, pattern)
                || EF.Functions.ILike(a.Category, pattern)
                || (a.AssetTag != null && EF.Functions.ILike(a.AssetTag, pattern))
                || (a.Location != null && EF.Functions.ILike(a.Location, pattern)));
        }

        var assets = await q.ToListAsync(cancellationToken).ConfigureAwait(false);
        var posted = await FixedAssetRegister.LoadPostedAsync(dbContext, assets.ConvertAll(a => a.Id), cancellationToken).ConfigureAwait(false);

        return assets
            .OrderBy(a => a.IsDisposed)
            .ThenBy(a => a.Category, StringComparer.OrdinalIgnoreCase)
            .ThenBy(a => a.Name, StringComparer.OrdinalIgnoreCase)
            .Select(a => FixedAssetRegister.ToDto(a, posted.For(a.Id)))
            .ToList();
    }
}
