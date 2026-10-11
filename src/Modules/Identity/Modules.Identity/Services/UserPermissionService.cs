using System.Security.Claims;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Caching;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Identity.Claims;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Caching;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace FSH.Modules.Identity.Services;

internal sealed class UserPermissionService(
    UserManager<FshUser> userManager,
    RoleManager<FshRole> roleManager,
    IdentityDbContext db,
    HybridCache cache,
    IMultiTenantContextAccessor<AppTenantInfo>? tenantAccessor = null,
    IHttpContextAccessor? httpContextAccessor = null) : IUserPermissionService
{
    // Hoisted to avoid per-call allocations. Small payload (< 4 KB after base64), so compression
    // CPU beats the marginal network savings — disable it for this hot path.
    private static readonly HybridCacheEntryOptions EntryOptions = new()
    {
        Expiration = TimeSpan.FromHours(1),
        LocalCacheExpiration = TimeSpan.FromMinutes(2),
        Flags = HybridCacheEntryFlags.DisableCompression,
    };


    public async Task<List<string>?> GetPermissionsAsync(string userId, CancellationToken cancellationToken)
    {
        var set = await GetOrLoadAsync(userId, cancellationToken).ConfigureAwait(false);

        // Copy to a new List<string> to preserve the public contract; ~50 ns is negligible vs the
        // JSON deserialization we'd otherwise pay per L1 hit without the [ImmutableObject] optimization.
        return [.. set.Values];
    }

    public async Task<bool> HasPermissionAsync(string userId, string permission, CancellationToken cancellationToken = default)
    {
        // Fast path: use the cached PermissionSet directly to avoid materializing a List<string>
        // just to check a single permission. Shares the cache entry with GetPermissionsAsync.
        var set = await GetOrLoadAsync(userId, cancellationToken).ConfigureAwait(false);
        return set.Contains(permission);
    }

    public async Task InvalidatePermissionCacheAsync(string userId, CancellationToken cancellationToken)
    {
        // The per-user tag covers every tenant-qualified variant of the key; the explicit removes are a
        // belt-and-braces for the current tenant's key and the pre-tenant-qualified legacy key.
        await cache.RemoveByTagAsync(CacheKeys.Tags.User(userId), cancellationToken).ConfigureAwait(false);
        await cache.RemoveAsync(CacheKeyFor(userId), cancellationToken).ConfigureAwait(false);
        await cache.RemoveAsync(CacheKeys.UserPermissions(userId), cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Tenant-qualified cache key. The tenant is the caller's own (JWT "tenant" claim) when the lookup is
    /// for the signed-in user — so a root operator acting in another tenant via the header override keeps
    /// hitting its own entry — otherwise the resolved Finbuckle tenant.
    /// </summary>
    internal string CacheKeyFor(string userId)
    {
        string? tenant = null;
        ClaimsPrincipal? principal = httpContextAccessor?.HttpContext?.User;
        if (principal?.Identity?.IsAuthenticated is true
            && string.Equals(principal.GetUserId(), userId, StringComparison.Ordinal))
        {
            tenant = principal.GetTenant();
        }

        if (string.IsNullOrWhiteSpace(tenant))
        {
            tenant = tenantAccessor?.MultiTenantContext?.TenantInfo?.Id;
        }

        return $"{CacheKeys.UserPermissions(userId)}:t:{tenant ?? "-"}";
    }

    private async ValueTask<PermissionSet> GetOrLoadAsync(string userId, CancellationToken cancellationToken)
    {
        // Stateless factory overload — the factory is a static method group, so the runtime
        // reuses a cached delegate and no closure is allocated per call (including L1 hits).
        var state = new FactoryState(userManager, roleManager, db, userId);
        string key = CacheKeyFor(userId);

        var set = await cache.GetOrCreateAsync(
            key,
            state,
            LoadPermissionsAsync,
            options: EntryOptions,
            tags: [CacheKeys.Tags.Permissions, CacheKeys.Tags.User(userId)],
            cancellationToken: cancellationToken).ConfigureAwait(false);

        // Never keep an EMPTY set: a user read in the window between creation and role assignment
        // (tenant provisioning, admin "create user then assign role") would otherwise be pinned to
        // "no permissions" for the full TTL and get 403 on everything.
        if (set.Values.IsEmpty)
        {
            await cache.RemoveAsync(key, cancellationToken).ConfigureAwait(false);
        }

        return set;
    }

    private static async ValueTask<PermissionSet> LoadPermissionsAsync(FactoryState s, CancellationToken ct)
    {
        var user = await s.UserManager.FindByIdAsync(s.UserId).ConfigureAwait(false);
        _ = user ?? throw new UnauthorizedException();

        var userRoles = await s.UserManager.GetRolesAsync(user).ConfigureAwait(false);

        var directRoleIds = await s.RoleManager.Roles
            .Where(r => userRoles.Contains(r.Name!))
            .Select(r => r.Id)
            .ToListAsync(ct).ConfigureAwait(false);

        // Group-derived roles confer permissions too — the JWT already unions them
        // (IdentityService.AddRoleClaimsAsync) and every group mutation invalidates this
        // cache entry, so the effective set must include roles reachable via UserGroups.
        var groupRoleIds = await s.Db.GroupRoles
            .Where(gr => s.Db.UserGroups
                .Where(ug => ug.UserId == s.UserId)
                .Select(ug => ug.GroupId)
                .Contains(gr.GroupId))
            .Select(gr => gr.RoleId)
            .Distinct()
            .ToListAsync(ct).ConfigureAwait(false);

        var roleIds = directRoleIds.Union(groupRoleIds, StringComparer.Ordinal).ToList();

        if (roleIds.Count == 0)
        {
            return PermissionSet.Empty;
        }

        // Single query across all role IDs — cheaper than the old N+1 loop.
        var perms = await s.Db.RoleClaims
            .Where(rc => roleIds.Contains(rc.RoleId) && rc.ClaimType == ClaimConstants.Permission)
            .Select(rc => rc.ClaimValue!)
            .Distinct()
            .ToListAsync(ct).ConfigureAwait(false);

        return perms.Count == 0
            ? PermissionSet.Empty
            : new PermissionSet([.. perms]);
    }

    // Struct state flows through HybridCache's TState parameter — avoids closure allocation.
    private readonly record struct FactoryState(
        UserManager<FshUser> UserManager,
        RoleManager<FshRole> RoleManager,
        IdentityDbContext Db,
        string UserId);
}
