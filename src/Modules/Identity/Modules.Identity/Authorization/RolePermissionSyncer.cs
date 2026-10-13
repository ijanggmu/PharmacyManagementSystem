using FSH.Framework.Caching;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Identity.Claims;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Finbuckle.MultiTenant.Abstractions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Identity.Authorization;

/// <summary>
/// Reconciles permission claims on the built-in roles (<see cref="RoleConstants.Admin"/>,
/// <see cref="RoleConstants.Basic"/>) and the seeded pharmacy roles (<see cref="PharmacyRoleSeedData.Roles"/>:
/// Manager/Pharmacist/Cashier/Staff) for the current Finbuckle tenant context. Idempotent — it adds claims
/// that are missing (so a permission a module introduces later, e.g. Customers.Ledger.Credit, reaches existing
/// tenants' pharmacy roles without a re-seed; extra permissions an admin granted are never removed) and
/// revokes claims that a role must never hold. For the pharmacy roles each seeded permission is offered only
/// ONCE — a <see cref="PharmacyRoleSeedData.SeededPermissionClaimType"/> marker claim records it — so a
/// permission a tenant admin later removes from e.g. Manager is not re-granted on the next startup:
/// <list type="bullet">
/// <item>registered non-basic permissions on the framework-managed Basic role (e.g. AuditTrails.View
/// after it stopped being basic) — Basic is a system role tenants cannot edit, so this never undoes a
/// tenant's own customisation;</item>
/// <item>root-only (<c>IsRoot</c>) permissions on ANY role outside the root tenant (e.g. Billing.Manage
/// after it became platform-only).</item>
/// </list>
/// </summary>
public sealed class RolePermissionSyncer(
    IdentityDbContext context,
    RoleManager<FshRole> roleManager,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    HybridCache cache,
    TimeProvider timeProvider,
    ILogger<RolePermissionSyncer> logger)
{
    public async Task SyncAsync(CancellationToken cancellationToken)
    {
        var tenantId = tenantAccessor.MultiTenantContext.TenantInfo?.Id;
        bool isRoot = tenantId == MultitenancyConstants.Root.Id;

        int basicAdded = await SyncRoleAsync(RoleConstants.Basic, PermissionConstants.Basic, cancellationToken).ConfigureAwait(false);

        // Admin gets all non-root permissions; the root tenant's Admin additionally gets Root permissions.
        var adminPermissions = isRoot
            ? PermissionConstants.Admin.Concat(PermissionConstants.Root).Distinct().ToList()
            : PermissionConstants.Admin.ToList();
        int adminAdded = await SyncRoleAsync(RoleConstants.Admin, adminPermissions, cancellationToken).ConfigureAwait(false);

        // Pharmacy business roles: offer what the seed table grants (same rules as IdentityDbInitializer's
        // seed) but has not been offered to this role yet. Root-only permissions are never added outside root.
        int pharmacyAdded = 0;
        foreach (var pharmacyRole in PharmacyRoleSeedData.Roles)
        {
            var seeded = PharmacyRoleSeedData.ResolveFor(pharmacyRole)
                .Where(p => isRoot || !p.IsRoot)
                .ToList();
            pharmacyAdded += await SyncSeededRoleAsync(pharmacyRole, seeded, cancellationToken).ConfigureAwait(false);
        }

        // Revocations: Basic keeps only basic permissions (of the registered ones), and no role outside
        // the root tenant may hold a root-only permission.
        var nonBasic = PermissionConstants.All.Where(p => !p.IsBasic).Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
        int removed = await RevokeAsync(RoleConstants.Basic, nonBasic, cancellationToken).ConfigureAwait(false);
        if (!isRoot)
        {
            var rootOnly = PermissionConstants.Root.Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
            removed += await RevokeAsync(roleName: null, rootOnly, cancellationToken).ConfigureAwait(false);
        }

        // If we wrote anything, drop the per-user permission cache so already-logged-in
        // sessions see the new perms on their next request rather than waiting for TTL.
        if (basicAdded + adminAdded + pharmacyAdded + removed > 0)
        {
            await cache.RemoveByTagAsync(CacheKeys.Tags.Permissions, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task<int> SyncRoleAsync(string roleName, IReadOnlyList<FshPermission> targetPermissions, CancellationToken cancellationToken)
    {
        var role = await roleManager.Roles
            .SingleOrDefaultAsync(r => r.Name == roleName, cancellationToken)
            .ConfigureAwait(false);
        if (role is null)
        {
            // Role not yet seeded — full IdentityDbInitializer.SeedAsync will create it the first time.
            return 0;
        }

        var existing = await context.RoleClaims
            .Where(rc => rc.RoleId == role.Id && rc.ClaimType == ClaimConstants.Permission)
            .Select(rc => rc.ClaimValue!)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var existingSet = existing.ToHashSet(StringComparer.Ordinal);

        var toAdd = targetPermissions
            .Where(p => !existingSet.Contains(p.Name))
            .Select(p => new FshRoleClaim
            {
                RoleId = role.Id,
                ClaimType = ClaimConstants.Permission,
                ClaimValue = p.Name,
                CreatedBy = "RolePermissionSyncer",
                CreatedOn = timeProvider.GetUtcNow(),
            })
            .ToList();

        if (toAdd.Count == 0)
        {
            return 0;
        }

        await context.RoleClaims.AddRangeAsync(toAdd, cancellationToken).ConfigureAwait(false);
        await context.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (logger.IsEnabled(LogLevel.Information))
        {
            logger.LogInformation(
                "Synced {Count} new permission claim(s) to '{Role}' for tenant '{Tenant}'",
                toAdd.Count,
                roleName,
                tenantAccessor.MultiTenantContext.TenantInfo?.Id);
        }

        return toAdd.Count;
    }

    /// <summary>
    /// Grants each seeded permission the role has not been offered before (no marker claim yet) and records a
    /// marker for it, so later admin removals stick, then applies the one-time seed retractions. Returns the number
    /// of permission claims added or retracted.
    /// </summary>
    private async Task<int> SyncSeededRoleAsync(string roleName, IReadOnlyList<FshPermission> seededPermissions, CancellationToken cancellationToken)
    {
        var role = await roleManager.Roles
            .SingleOrDefaultAsync(r => r.Name == roleName, cancellationToken)
            .ConfigureAwait(false);
        if (role is null)
        {
            return 0;
        }

        int permissionsAdded = await PharmacyRoleSeedData
            .OfferSeededPermissionsAsync(context, role.Id, seededPermissions, "RolePermissionSyncer", timeProvider.GetUtcNow(), cancellationToken)
            .ConfigureAwait(false);

        // One-time retraction of permissions the seed used to grant this role (only seed-authored claims).
        int retracted = await PharmacyRoleSeedData
            .RetractSeededPermissionsAsync(context, role.Id, roleName, "RolePermissionSyncer", timeProvider.GetUtcNow(), cancellationToken)
            .ConfigureAwait(false);
        if (retracted > 0 && logger.IsEnabled(LogLevel.Warning))
        {
            logger.LogWarning(
                "Retracted {Count} seed-granted permission claim(s) from '{Role}' for tenant '{Tenant}'",
                retracted,
                roleName,
                tenantAccessor.MultiTenantContext.TenantInfo?.Id);
        }

        permissionsAdded += retracted;

        if (permissionsAdded > 0 && logger.IsEnabled(LogLevel.Information))
        {
            logger.LogInformation(
                "Synced {Count} new seeded permission claim(s) to '{Role}' for tenant '{Tenant}'",
                permissionsAdded,
                roleName,
                tenantAccessor.MultiTenantContext.TenantInfo?.Id);
        }

        return permissionsAdded;
    }

    /// <summary>
    /// Deletes permission claims whose value is in <paramref name="forbidden"/> from the named role, or
    /// from every role in the tenant when <paramref name="roleName"/> is null. Returns the count removed.
    /// </summary>
    private async Task<int> RevokeAsync(string? roleName, HashSet<string> forbidden, CancellationToken cancellationToken)
    {
        if (forbidden.Count == 0)
        {
            return 0;
        }

        var query = context.RoleClaims.Where(rc => rc.ClaimType == ClaimConstants.Permission);
        if (roleName is not null)
        {
            var role = await roleManager.Roles
                .SingleOrDefaultAsync(r => r.Name == roleName, cancellationToken)
                .ConfigureAwait(false);
            if (role is null)
            {
                return 0;
            }

            query = query.Where(rc => rc.RoleId == role.Id);
        }

        var names = forbidden.ToList();
        var toRemove = await query
            .Where(rc => names.Contains(rc.ClaimValue!))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (toRemove.Count == 0)
        {
            return 0;
        }

        context.RoleClaims.RemoveRange(toRemove);
        await context.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (logger.IsEnabled(LogLevel.Warning))
        {
            logger.LogWarning(
                "Revoked {Count} permission claim(s) that role '{Role}' must not hold for tenant '{Tenant}'",
                toRemove.Count,
                roleName ?? "*",
                tenantAccessor.MultiTenantContext.TenantInfo?.Id);
        }

        return toRemove.Count;
    }
}
