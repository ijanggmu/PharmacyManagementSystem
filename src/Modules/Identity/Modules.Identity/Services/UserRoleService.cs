using System.Net;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Identity.Services;

internal sealed class UserRoleService(
    UserManager<FshUser> userManager,
    RoleManager<FshRole> roleManager,
    IdentityDbContext db,
    IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
    ICurrentUser currentUser,
    IUserPermissionService userPermissionService,
    ISecurityAudit securityAudit) : IUserRoleService
{
    public async Task<string> AssignRolesAsync(string userId, List<UserRoleDto> userRoles, CancellationToken cancellationToken)
    {
        var user = await userManager.Users
            .Where(u => u.Id == userId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("user not found");

        // Granting or taking away Admin is an administrator's call on every path (PUT /users/{id} and
        // POST /users/{id}/roles alike): Users.ManageRoles alone must not let a manager make themselves Admin.
        await EnsureCallerMayChangeAdminRoleAsync(user, userRoles);

        await ValidateAdminRoleChangeAsync(user, userRoles);

        var (assignedRoles, revokedRoles) = await ProcessRoleAssignmentsAsync(user, userRoles);

        await RaiseRolesAssignedEventAsync(user, assignedRoles, cancellationToken);
        await AuditRoleChangesAsync(user, assignedRoles, revokedRoles, cancellationToken);

        // Any role mutation (add or remove) invalidates the cached permission set; flush
        // unconditionally rather than gating on assignedRoles, which only tracks additions.
        await userPermissionService.InvalidatePermissionCacheAsync(userId, cancellationToken).ConfigureAwait(false);

        return "User Roles Updated Successfully.";
    }

    public async Task<List<UserRoleDto>> GetUserRolesAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await userManager.FindByIdAsync(userId)
            ?? throw new NotFoundException("user not found");

        var roles = await roleManager.Roles.AsNoTracking().ToListAsync(cancellationToken)
            ?? throw new NotFoundException("roles not found");

        // Single membership query instead of one IsInRoleAsync round-trip per role.
        var memberships = await userManager.GetRolesAsync(user);
        var membershipSet = new HashSet<string>(memberships, StringComparer.OrdinalIgnoreCase);

        var userRoles = new List<UserRoleDto>();
        foreach (var role in roles)
        {
            userRoles.Add(new UserRoleDto
            {
                RoleId = role.Id,
                RoleName = role.Name,
                Description = role.Description,
                Enabled = membershipSet.Contains(role.Name!)
            });
        }

        return userRoles;
    }

    /// <summary>Role names resolve the way <see cref="RoleManager{TRole}"/> finds them (normalized), so "admin" or
    /// " Admin " is the Admin role too.</summary>
    internal static bool IsAdminRoleName(string? roleName) =>
        string.Equals(roleName?.Trim(), RoleConstants.Admin, StringComparison.OrdinalIgnoreCase);

    private async Task EnsureCallerMayChangeAdminRoleAsync(FshUser user, List<UserRoleDto> userRoles)
    {
        var adminRows = userRoles.Where(r => IsAdminRoleName(r.RoleName)).ToList();
        if (adminRows.Count == 0)
        {
            return;
        }

        bool targetIsAdmin = await userManager.IsInRoleAsync(user, RoleConstants.Admin);
        if (adminRows.TrueForAll(r => r.Enabled == targetIsAdmin))
        {
            // The roles dialog sends every role; an unchanged Admin row needs no extra authority.
            return;
        }

        // The root operator may manage another tenant's users, where they have no account of their own.
        if (string.Equals(currentUser.GetTenant(), MultitenancyConstants.Root.Id, StringComparison.Ordinal)
            && currentUser.IsInRole(RoleConstants.Admin))
        {
            return;
        }

        var actorId = currentUser.GetUserId();
        FshUser? actor = actorId == Guid.Empty ? null : await userManager.FindByIdAsync(actorId.ToString());
        if (actor is null || !await userManager.IsInRoleAsync(actor, RoleConstants.Admin))
        {
            throw new ForbiddenException("Only administrators can grant or remove the Admin role.");
        }
    }

    private async Task ValidateAdminRoleChangeAsync(FshUser user, List<UserRoleDto> userRoles)
    {
        bool isRemovingAdminRole = userRoles.Exists(a => !a.Enabled && IsAdminRoleName(a.RoleName));
        if (!isRemovingAdminRole)
        {
            return;
        }

        bool userIsAdmin = await userManager.IsInRoleAsync(user, RoleConstants.Admin);
        if (!userIsAdmin)
        {
            return;
        }

        // Administrators cannot demote themselves — they would lose access immediately on the next request,
        // and would need another admin to restore them.
        var actorId = currentUser.GetUserId();
        if (actorId != Guid.Empty && string.Equals(actorId.ToString(), user.Id, StringComparison.Ordinal))
        {
            throw new CustomException(
                "Administrators cannot remove their own admin role.",
                Array.Empty<string>(),
                HttpStatusCode.BadRequest);
        }

        // The root tenant's seed admin is the framework's last-resort recovery account.
        if (IsRootTenantAdmin(user))
        {
            throw new ForbiddenException("The root tenant administrator cannot be demoted.");
        }

        // After this removal, at least one admin must remain in the tenant — matches
        // the "at least one active administrator" invariant enforced on user deactivation.
        await EnsureMinimumAdminCountAsync();
    }

    private bool IsRootTenantAdmin(FshUser user)
    {
        return user.Email == MultitenancyConstants.Root.EmailAddress
            && multiTenantContextAccessor?.MultiTenantContext?.TenantInfo?.Id == MultitenancyConstants.Root.Id;
    }

    private async Task EnsureMinimumAdminCountAsync()
    {
        int adminCount = (await userManager.GetUsersInRoleAsync(RoleConstants.Admin)).Count;
        if (adminCount <= 1)
        {
            throw new CustomException(
                "Tenant must retain at least one administrator.",
                Array.Empty<string>(),
                HttpStatusCode.BadRequest);
        }
    }

    private async Task<(List<string> Assigned, List<string> Revoked)> ProcessRoleAssignmentsAsync(FshUser user, List<UserRoleDto> userRoles)
    {
        var assignedRoles = new List<string>();
        var revokedRoles = new List<string>();

        foreach (var userRole in userRoles)
        {
            if (string.IsNullOrWhiteSpace(userRole.RoleName))
            {
                continue;
            }

            var role = await roleManager.FindByNameAsync(userRole.RoleName.Trim());
            if (role?.Name is null)
            {
                continue;
            }

            bool isMember = await userManager.IsInRoleAsync(user, role.Name);
            if (userRole.Enabled && !isMember)
            {
                await userManager.AddToRoleAsync(user, role.Name);
                assignedRoles.Add(role.Name);
            }
            else if (!userRole.Enabled && isMember)
            {
                await userManager.RemoveFromRoleAsync(user, role.Name);
                revokedRoles.Add(role.Name);
            }
        }

        return (assignedRoles, revokedRoles);
    }

    private async Task AuditRoleChangesAsync(
        FshUser user,
        List<string> assignedRoles,
        List<string> revokedRoles,
        CancellationToken cancellationToken)
    {
        var actorId = currentUser.GetUserId();
        string? actor = actorId == Guid.Empty ? null : actorId.ToString();
        string? userName = user.UserName ?? user.Email;

        foreach (var role in assignedRoles)
        {
            await securityAudit.RoleAssignedAsync(user.Id, userName, role, actor, cancellationToken).ConfigureAwait(false);
        }

        foreach (var role in revokedRoles)
        {
            await securityAudit.RoleRevokedAsync(user.Id, userName, role, actor, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task RaiseRolesAssignedEventAsync(FshUser user, List<string> assignedRoles, CancellationToken cancellationToken)
    {
        if (assignedRoles.Count == 0)
        {
            return;
        }

        var tenantId = multiTenantContextAccessor?.MultiTenantContext?.TenantInfo?.Id;
        user.RecordRolesAssigned(assignedRoles, tenantId);
        await db.SaveChangesAsync(cancellationToken);
    }
}