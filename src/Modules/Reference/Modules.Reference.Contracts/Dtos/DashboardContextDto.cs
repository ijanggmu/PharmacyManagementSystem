namespace FSH.Modules.Reference.Contracts.Dtos;

/// <summary>
/// Dashboard bootstrap payload: the current user, their tenant, and notification badge counts. .NET
/// port of the Next.js reference's <c>getDashboardContextData</c>
/// (lib/server/services/dashboard-page-service.ts, backing <c>GET /api/dashboard/context</c>).
///
/// The Next.js version also returns a <c>branchCount</c>, used to hide branch-to-branch features (e.g.
/// Stock Transfers) for single-branch tenants. <see cref="BranchCount"/> is the number of active branches
/// for the current tenant, sourced from <c>IBranchService</c>; it is 0 when the caller has no tenant.
/// </summary>
public sealed record DashboardContextDto(
    Guid UserId,
    string UserName,
    string? UserEmail,
    string TenantId,
    string? TenantName,
    string? TenantPlan,
    int LowStockCount,
    int ExpiringCount,
    int PendingPrescriptionsCount,
    int PendingReturnsCount,
    int PendingRefundsCount,
    int BranchCount);
