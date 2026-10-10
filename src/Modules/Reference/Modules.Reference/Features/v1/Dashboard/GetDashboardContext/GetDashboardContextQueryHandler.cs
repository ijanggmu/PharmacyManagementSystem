using FSH.Framework.Core.Context;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantStatus;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Dashboard;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Returns;
using Mediator;

namespace FSH.Modules.Reference.Features.v1.Dashboard.GetDashboardContext;

/// <summary>
/// Composes the dashboard bootstrap payload entirely from <see cref="ICurrentUser"/> plus other
/// modules' already-ported queries (via <c>IMediator</c>) — no direct DbContext access to another
/// module, per the module-boundary rule. The branch count comes from <see cref="IBranchService"/>
/// (Multitenancy.Contracts), counting only the current tenant's active branches.
/// </summary>
public sealed class GetDashboardContextQueryHandler(
    ICurrentUser currentUser,
    IMediator mediator,
    IBranchService branchService)
    : IQueryHandler<GetDashboardContextQuery, DashboardContextDto>
{
    public async ValueTask<DashboardContextDto> Handle(GetDashboardContextQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var tenantId = currentUser.GetTenant();

        TenantStatusDto? tenantStatus = null;
        int branchCount = 0;
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            tenantStatus = await mediator.Send(new GetTenantStatusQuery(tenantId), cancellationToken).ConfigureAwait(false);

            var branches = await branchService.GetAllForCurrentTenantAsync(cancellationToken).ConfigureAwait(false);
            branchCount = branches.Count(b => b.IsActive);
        }

        // Every counter uses the same branch scope (each query confines a single-branch caller to their own).
        var reorderSuggestions = await mediator.Send(new GetReorderSuggestionsQuery(query.BranchId), cancellationToken).ConfigureAwait(false);
        var expiringBatches = await mediator.Send(new GetExpiringBatchesQuery(BranchId: query.BranchId), cancellationToken).ConfigureAwait(false);
        var prescriptionStats = await mediator.Send(new GetPrescriptionStatsQuery(), cancellationToken).ConfigureAwait(false);
        var pendingReturns = await mediator.Send(
            new SearchReturnsQuery(Status: "Pending", PageSize: 1, BranchId: query.BranchId), cancellationToken).ConfigureAwait(false);
        var pendingRefunds = await mediator.Send(
            new SearchRefundsQuery(Status: "Pending", PageSize: 1, BranchId: query.BranchId), cancellationToken).ConfigureAwait(false);

        return new DashboardContextDto(
            currentUser.GetUserId(),
            currentUser.Name ?? currentUser.GetUserEmail()?.Split('@')[0] ?? "User",
            currentUser.GetUserEmail(),
            tenantId ?? string.Empty,
            tenantStatus?.Name,
            tenantStatus?.Plan,
            reorderSuggestions.Count,
            expiringBatches.Count,
            prescriptionStats.Pending,
            (int)pendingReturns.TotalCount,
            (int)pendingRefunds.TotalCount,
            BranchCount: branchCount);
    }
}
