using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.SearchDepreciationRuns;

/// <summary>Depreciation runs, newest first, with their voucher numbers.</summary>
public sealed class SearchDepreciationRunsQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchDepreciationRunsQuery, IReadOnlyList<DepreciationRunDto>>
{
    public async ValueTask<IReadOnlyList<DepreciationRunDto>> Handle(SearchDepreciationRunsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        var q = dbContext.DepreciationRuns.AsNoTracking();
        if (query.FiscalYear is { } year)
        {
            q = q.Where(r => r.FiscalYear == year);
        }

        if (branchFilter is { } branchId)
        {
            q = q.Where(r => r.BranchId == branchId);
        }

        var runs = await q
            .OrderByDescending(r => r.PostedAtUtc)
            .Take(500)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var voucherIds = runs.Where(r => r.VoucherId != null).Select(r => r.VoucherId!.Value).ToList();
        var numbers = await dbContext.Vouchers
            .AsNoTracking()
            .Where(v => voucherIds.Contains(v.Id))
            .Select(v => new { v.Id, v.VoucherNo })
            .ToDictionaryAsync(v => v.Id, v => v.VoucherNo, cancellationToken)
            .ConfigureAwait(false);

        return runs
            .Select(r => new DepreciationRunDto(
                r.Id, r.FiscalYear, r.FromMonth, r.ToMonth, FixedAssetPosting.PeriodLabel(r.FiscalYear, r.FromMonth, r.ToMonth),
                r.BranchId, r.TotalAmount, r.AssetCount, r.VoucherId,
                r.VoucherId is { } id && numbers.TryGetValue(id, out var no) ? no : null,
                r.PostedAtUtc, r.PostedBy, r.ReversedAtUtc, r.ReversedBy))
            .ToList();
    }
}
