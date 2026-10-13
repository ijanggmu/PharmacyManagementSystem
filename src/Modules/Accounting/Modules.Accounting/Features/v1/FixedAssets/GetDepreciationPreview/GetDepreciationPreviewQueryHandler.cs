using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetDepreciationPreview;

/// <summary>What a depreciation run for the period would post, and whether it can be posted now. Read only.</summary>
public sealed class GetDepreciationPreviewQueryHandler(
    AccountingDbContext dbContext,
    AccountingPostingLockService postingLockService,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider) : IQueryHandler<GetDepreciationPreviewQuery, DepreciationPreviewDto>
{
    public async ValueTask<DepreciationPreviewDto> Handle(GetDepreciationPreviewQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        DateOnly today = NepalDate.FromUtc(timeProvider.GetUtcNow().UtcDateTime);
        var plan = await DepreciationPeriodPlan
            .BuildAsync(dbContext, postingLockService, query.FiscalYear, query.Month, branchFilter, today, cancellationToken)
            .ConfigureAwait(false);
        return plan.ToPreview();
    }
}
