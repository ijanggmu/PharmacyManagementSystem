using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Modules.Auditing.Persistence;
using FSH.Modules.Identity.Contracts.Services;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Auditing.Features.v1.Common;

/// <summary>
/// Resolved tenant visibility for an audit/log query.
/// <see cref="TenantId"/> is the single tenant to show, or <c>null</c> when <see cref="AllTenants"/> is set.
/// </summary>
public readonly record struct AuditTenantFilter(bool CrossTenant, bool AllTenants, string? TenantId);

/// <summary>
/// One place for the "own tenant by default, other / all tenants only with
/// <c>Permissions.AuditTrails.ViewCrossTenant</c>" rule shared by the log queries. Callers pass the
/// optional <c>tenantId</c> query parameter; <see cref="AllTenantsToken"/> (<c>*</c>) asks for every tenant.
/// </summary>
public static class AuditTenantScope
{
    public const string AllTenantsToken = "*";

    public static async Task<AuditTenantFilter> ResolveAsync(
        ICurrentUser currentUser,
        IUserPermissionService permissions,
        string? requestedTenantId,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(currentUser);
        ArgumentNullException.ThrowIfNull(permissions);

        var currentTenant = currentUser.GetTenant();
        var requested = string.IsNullOrWhiteSpace(requestedTenantId) ? null : requestedTenantId.Trim();

        bool wantsAll = string.Equals(requested, AllTenantsToken, StringComparison.Ordinal);
        bool wantsOther = requested is not null && !wantsAll
            && !string.Equals(requested, currentTenant, StringComparison.OrdinalIgnoreCase);

        if (!wantsAll && !wantsOther)
        {
            return new AuditTenantFilter(CrossTenant: false, AllTenants: false, TenantId: currentTenant);
        }

        var userId = currentUser.GetUserId().ToString();
        var allowed = await permissions
            .HasPermissionAsync(userId, AuditingPermissions.AuditTrails.ViewCrossTenant, ct)
            .ConfigureAwait(false);
        if (!allowed)
        {
            throw new ForbiddenException("Cross-tenant log access requires Permissions.AuditTrails.ViewCrossTenant.");
        }

        return wantsAll
            ? new AuditTenantFilter(CrossTenant: true, AllTenants: true, TenantId: null)
            : new AuditTenantFilter(CrossTenant: true, AllTenants: false, TenantId: requested);
    }

    /// <summary>
    /// Audit records are Finbuckle-filtered to the ambient tenant; a cross-tenant request bypasses
    /// that filter and (unless "all") re-applies an explicit TenantId predicate.
    /// </summary>
    public static async Task<IQueryable<AuditRecord>> AuditRecordsAsync(
        AuditDbContext dbContext,
        ICurrentUser currentUser,
        IUserPermissionService permissions,
        string? requestedTenantId,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var filter = await ResolveAsync(currentUser, permissions, requestedTenantId, ct).ConfigureAwait(false);
        if (!filter.CrossTenant)
        {
            return dbContext.AuditRecords.AsNoTracking();
        }

        var all = dbContext.AuditRecords.AsNoTracking().IgnoreQueryFilters();
        return filter.AllTenants ? all : all.Where(a => a.TenantId == filter.TenantId);
    }

    /// <summary>Clamps a from/to window: default lookback when open-ended, never wider than <paramref name="max"/>.</summary>
    public static (DateTime FromUtc, DateTime ToUtc) ResolveWindow(
        DateTime? from, DateTime? to, TimeSpan defaultWindow, TimeSpan max, TimeProvider timeProvider)
    {
        ArgumentNullException.ThrowIfNull(timeProvider);

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var resolvedTo = to ?? now;
        var resolvedFrom = from ?? resolvedTo - defaultWindow;

        if (resolvedTo - resolvedFrom > max)
        {
            resolvedFrom = resolvedTo - max;
        }

        return (resolvedFrom, resolvedTo);
    }
}
