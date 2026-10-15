using System.Net;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Identity.Features.v1.Roles;

public sealed class RoleService(RoleManager<FshRole> roleManager,
    IdentityDbContext context,
    IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
    ICurrentUser currentUser,
    IUserPermissionService userPermissionService) : IRoleService
{
    // Invalidate every user whose effective permissions may have shifted from a role mutation:
    // direct holders (AspNetUserRoles) and group-derived holders (members of groups carrying this role).
    private async Task InvalidateAffectedUsersAsync(string roleId, CancellationToken cancellationToken)
    {
        var role = await roleManager.FindByIdAsync(roleId);
        if (role?.Name is null)
        {
            return;
        }

        // Direct role holders via AspNetUserRoles join.
        var directUserIds = await context.UserRoles
            .Where(ur => ur.RoleId == roleId)
            .Select(ur => ur.UserId)
            .ToListAsync(cancellationToken);

        // Group-derived role holders.
        var groupUserIds = await context.GroupRoles
            .Where(gr => gr.RoleId == roleId)
            .SelectMany(gr => context.UserGroups
                .Where(ug => ug.GroupId == gr.GroupId)
                .Select(ug => ug.UserId))
            .ToListAsync(cancellationToken);

        foreach (var userId in directUserIds.Concat(groupUserIds).Distinct())
        {
            await userPermissionService.InvalidatePermissionCacheAsync(userId, cancellationToken).ConfigureAwait(false);
        }
    }

    public async Task<PagedResponse<RoleDto>> GetRolesAsync(
        int pageNumber = 1,
        int pageSize = 20,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        if (roleManager is null)
            throw new NotFoundException("RoleManager<FshRole> not resolved. Check Identity registration.");

        if (roleManager.Roles is null)
            throw new NotFoundException("Role store not configured. Ensure .AddRoles<FshRole>() and EF stores.");

        var page = Math.Max(1, pageNumber);
        var size = Math.Clamp(pageSize, 1, 200);

        var query = roleManager.Roles.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var needle = search.Trim().ToLowerInvariant();
            query = query.Where(r =>
                (r.Name != null && r.Name.ToLower().Contains(needle))
                || (r.Description != null && r.Description.ToLower().Contains(needle)));
        }

        var total = await query.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var rows = await query
            .OrderBy(r => r.Name)
            .Skip((page - 1) * size)
            .Take(size)
            .Select(r => new RoleDto { Id = r.Id, Name = r.Name!, Description = r.Description })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<RoleDto>
        {
            Items = rows,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }

    public async Task<RoleDto?> GetRoleAsync(string id, CancellationToken cancellationToken = default)
    {
        FshRole? role = await roleManager.FindByIdAsync(id);

        _ = role ?? throw new NotFoundException("role not found");

        return new RoleDto { Id = role.Id, Name = role.Name!, Description = role.Description };
    }

    public async Task<RoleDto> CreateOrUpdateRoleAsync(string roleId, string name, string description, CancellationToken cancellationToken = default)
    {
        // Names are stored trimmed: " Admin" must not slip past the system-name check and then be read as Admin
        // by anything that trims (the discount cap does).
        string trimmedName = name?.Trim() ?? string.Empty;
        if (trimmedName.Length == 0)
        {
            throw new CustomException("Role name is required.", Array.Empty<string>(), HttpStatusCode.BadRequest);
        }

        FshRole? role = string.IsNullOrEmpty(roleId)
            ? null
            : await roleManager.FindByIdAsync(roleId);

        if (role != null)
        {
            // System roles cannot be modified — neither renamed nor re-described.
            EnsureNotSystemRole(role.Name, "System roles cannot be modified.");
            // And no custom role can be renamed to a system role's name.
            EnsureNotSystemRole(trimmedName, "Cannot rename a role to a system role's name.");
            await EnsureNameIsFreeAsync(trimmedName, role.Id).ConfigureAwait(false);

            role.Name = trimmedName;
            role.Description = description;
            EnsureSucceeded(await roleManager.UpdateAsync(role), "Could not update the role.");
        }
        else
        {
            // No new role can be created using a system role's name.
            EnsureNotSystemRole(trimmedName, "Cannot create a role using a system role's name.");
            await EnsureNameIsFreeAsync(trimmedName, exceptRoleId: null).ConfigureAwait(false);

            role = new FshRole(trimmedName, description);
            EnsureSucceeded(await roleManager.CreateAsync(role), "Could not create the role.");
        }

        return new RoleDto { Id = role.Id, Name = role.Name!, Description = role.Description };
    }

    private async Task EnsureNameIsFreeAsync(string name, string? exceptRoleId)
    {
        var existing = await roleManager.FindByNameAsync(name);
        if (existing is not null && !string.Equals(existing.Id, exceptRoleId, StringComparison.Ordinal))
        {
            throw new CustomException($"A role named '{existing.Name}' already exists.", Array.Empty<string>(), HttpStatusCode.Conflict);
        }
    }

    private static void EnsureSucceeded(IdentityResult result, string message)
    {
        if (result.Succeeded)
        {
            return;
        }

        var errors = result.Errors.Select(e => e.Description).ToList();
        var status = result.Errors.Any(e => string.Equals(e.Code, nameof(IdentityErrorDescriber.DuplicateRoleName), StringComparison.Ordinal))
            ? HttpStatusCode.Conflict
            : HttpStatusCode.BadRequest;
        throw new CustomException(message, errors, status);
    }

    public async Task DeleteRoleAsync(string id, CancellationToken cancellationToken = default)
    {
        FshRole? role = await roleManager.FindByIdAsync(id);

        _ = role ?? throw new NotFoundException("role not found");

        EnsureNotSystemRole(role.Name, "System roles cannot be deleted.");

        // Snapshot affected users BEFORE the cascade removes the role-mapping rows,
        // otherwise the lookup returns an empty set after delete.
        await InvalidateAffectedUsersAsync(id, cancellationToken).ConfigureAwait(false);

        await roleManager.DeleteAsync(role);
    }

    public async Task<RoleDto> GetWithPermissionsAsync(string id, CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(id, cancellationToken);
        _ = role ?? throw new NotFoundException("role not found");

        role.Permissions = await context.RoleClaims
            .AsNoTracking()
            .Where(c => c.RoleId == id && c.ClaimType == ClaimConstants.Permission)
            .Select(c => c.ClaimValue!)
            .ToListAsync(cancellationToken);

        return role;
    }

    public async Task<string> UpdatePermissionsAsync(string roleId, List<string> permissions, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(permissions);

        var role = await roleManager.FindByIdAsync(roleId)
            ?? throw new NotFoundException("role not found");

        EnsureNotSystemRole(role.Name, "System role permissions are managed by the framework and cannot be modified.");
        EnsureKnownPermissions(permissions);
        FilterRootPermissions(permissions);

        var currentClaims = await roleManager.GetClaimsAsync(role);
        await EnsureCallerMayGrantAsync(role, currentClaims, permissions, cancellationToken).ConfigureAwait(false);
        await RemoveRevokedPermissionsAsync(role, currentClaims, permissions, cancellationToken);
        await AddNewPermissionsAsync(role, currentClaims, permissions, cancellationToken);

        // Permissions on the role just changed — every user reachable through this
        // role (directly or via group membership) now has a stale cache entry.
        await InvalidateAffectedUsersAsync(roleId, cancellationToken).ConfigureAwait(false);

        return "permissions updated";
    }

    private static void EnsureNotSystemRole(string? roleName, string message)
    {
        if (IsSystemRoleName(roleName))
        {
            throw new CustomException(message, Array.Empty<string>(), HttpStatusCode.BadRequest);
        }
    }

    /// <summary>Admin / Basic in any case and with any surrounding whitespace ("admin", " Basic ").</summary>
    internal static bool IsSystemRoleName(string? roleName)
    {
        string trimmed = roleName?.Trim() ?? string.Empty;
        return trimmed.Length > 0
            && RoleConstants.DefaultRoles.Any(r => string.Equals(r, trimmed, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Every name must be in the registered permission catalog; nothing else is stored.</summary>
    private static void EnsureKnownPermissions(List<string> permissions)
    {
        var known = PermissionConstants.All.Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
        var unknown = permissions
            .Where(p => !string.IsNullOrWhiteSpace(p) && !known.Contains(p))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (unknown.Count > 0)
        {
            throw new CustomException(
                "Unknown permission(s).",
                unknown.Select(p => $"'{p}' is not a permission."),
                HttpStatusCode.BadRequest);
        }

        permissions.RemoveAll(string.IsNullOrWhiteSpace);
    }

    /// <summary>
    /// Holding Roles.Update is not a licence to escalate. Unless the caller is an administrator (or the root
    /// operator), they may not edit a role they hold themselves (directly or through a group), and may only grant
    /// permissions they hold. Removing permissions from other roles is allowed.
    /// </summary>
    private async Task EnsureCallerMayGrantAsync(
        FshRole role,
        IList<System.Security.Claims.Claim> currentClaims,
        List<string> permissions,
        CancellationToken cancellationToken)
    {
        string actorId = currentUser.GetUserId().ToString();
        if (await IsAdministratorAsync(actorId, cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        bool holdsRole = await context.UserRoles
                .AnyAsync(ur => ur.UserId == actorId && ur.RoleId == role.Id, cancellationToken).ConfigureAwait(false)
            || await context.GroupRoles
                .Where(gr => gr.RoleId == role.Id)
                .AnyAsync(gr => context.UserGroups.Any(ug => ug.GroupId == gr.GroupId && ug.UserId == actorId), cancellationToken)
                .ConfigureAwait(false);
        if (holdsRole)
        {
            throw new ForbiddenException("You can't change the permissions of a role you hold. Ask an administrator.");
        }

        var added = permissions
            .Where(p => !currentClaims.Any(c => c.Type == ClaimConstants.Permission && c.Value == p))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (added.Count == 0)
        {
            return;
        }

        var held = (await userPermissionService.GetPermissionsAsync(actorId, cancellationToken).ConfigureAwait(false) ?? [])
            .ToHashSet(StringComparer.Ordinal);
        var notHeld = added.Where(p => !held.Contains(p)).ToList();
        if (notHeld.Count > 0)
        {
            throw new ForbiddenException(
                $"You can only grant permissions you hold yourself. Not held: {string.Join(", ", notHeld)}.");
        }
    }

    private async Task<bool> IsAdministratorAsync(string actorId, CancellationToken cancellationToken)
    {
        // The root operator may act on another tenant's roles, where they have no membership row.
        if (string.Equals(currentUser.GetTenant(), MultitenancyConstants.Root.Id, StringComparison.Ordinal)
            && currentUser.IsInRole(RoleConstants.Admin))
        {
            return true;
        }

        string adminNormalized = RoleConstants.Admin.ToUpperInvariant();
        return await context.UserRoles
            .Where(ur => ur.UserId == actorId)
            .Join(context.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.NormalizedName)
            .AnyAsync(n => n == adminNormalized, cancellationToken)
            .ConfigureAwait(false);
    }

    private void FilterRootPermissions(List<string> permissions)
    {
        if (multiTenantContextAccessor?.MultiTenantContext?.TenantInfo?.Id == MultitenancyConstants.Root.Id)
        {
            // The root operator may manage root-only permissions.
            return;
        }

        // Strip every permission flagged IsRoot in the registry. (A prior prefix check on "Permissions.Root."
        // was a no-op — no root perm uses that prefix — letting a tenant admin grant themselves root perms.)
        var rootOnly = PermissionConstants.Root.Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
        permissions.RemoveAll(rootOnly.Contains);
    }

    private async Task RemoveRevokedPermissionsAsync(FshRole role, IList<System.Security.Claims.Claim> currentClaims, List<string> permissions, CancellationToken cancellationToken = default)
    {
        // Only permission claims are managed here; other role-claim types (e.g. seed markers) are left alone.
        var claimsToRemove = currentClaims.Where(c => c.Type == ClaimConstants.Permission && !permissions.Exists(p => p == c.Value));

        foreach (var claim in claimsToRemove)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = await roleManager.RemoveClaimAsync(role, claim);
            if (!result.Succeeded)
            {
                var errors = result.Errors.Select(error => error.Description).ToList();
                throw new CustomException("operation failed", errors);
            }
        }
    }

    private async Task AddNewPermissionsAsync(FshRole role, IList<System.Security.Claims.Claim> currentClaims, List<string> permissions, CancellationToken cancellationToken = default)
    {
        var newPermissions = permissions
            .Where(p => !string.IsNullOrEmpty(p) && !currentClaims.Any(c => c.Type == ClaimConstants.Permission && c.Value == p))
            .ToList();

        foreach (string permission in newPermissions)
        {
            context.RoleClaims.Add(new FshRoleClaim
            {
                RoleId = role.Id,
                ClaimType = ClaimConstants.Permission,
                ClaimValue = permission,
                CreatedBy = currentUser.GetUserId().ToString()
            });
        }

        if (newPermissions.Count > 0)
        {
            await context.SaveChangesAsync(cancellationToken);
        }
    }
}