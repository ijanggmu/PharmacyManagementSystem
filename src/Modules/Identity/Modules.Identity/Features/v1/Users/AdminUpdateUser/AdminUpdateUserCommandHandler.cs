using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Constants;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Users.AdminUpdateUser;
using FSH.Modules.Identity.Features.v1.Users.RegisterUser;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Identity.Features.v1.Users.AdminUpdateUser;

public sealed class AdminUpdateUserCommandHandler : ICommandHandler<AdminUpdateUserCommand, Unit>
{
    private readonly IUserService _userService;
    private readonly IUserProfileService _userProfileService;
    private readonly ICurrentUser _currentUser;
    private readonly IBranchService _branchService;

    public AdminUpdateUserCommandHandler(
        IUserService userService,
        IUserProfileService userProfileService,
        ICurrentUser currentUser,
        IBranchService branchService)
    {
        _userService = userService;
        _userProfileService = userProfileService;
        _currentUser = currentUser;
        _branchService = branchService;
    }

    public async ValueTask<Unit> Handle(AdminUpdateUserCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Tenant-scoped read first: a user outside the caller's tenant resolves to NotFound here.
        var current = await _userService.GetAsync(command.Id, cancellationToken).ConfigureAwait(false);

        // Validate and authorize the role change before any write happens.
        List<UserRoleDto>? roleUpdate = null;
        if (command.Roles is not null)
        {
            roleUpdate = await PlanRoleChangeAsync(command, cancellationToken).ConfigureAwait(false);
        }

        if (command.BranchId is Guid branchId)
        {
            await RegisterUserCommandHandler.EnsureActiveBranchAsync(_branchService, branchId, cancellationToken).ConfigureAwait(false);
        }

        await _userProfileService.UpdateDetailsAsync(
            command.Id,
            command.FirstName,
            command.LastName ?? string.Empty,
            command.PhoneNumber ?? string.Empty,
            cancellationToken).ConfigureAwait(false);

        // ToggleStatusAsync applies the admin, self-deactivation, admin-target and last-admin guards.
        if (command.IsActive is bool isActive && isActive != current.IsActive)
        {
            await _userService.ToggleStatusAsync(isActive, command.Id, cancellationToken).ConfigureAwait(false);
        }

        if (roleUpdate is not null)
        {
            await _userService.AssignRolesAsync(command.Id, roleUpdate, cancellationToken).ConfigureAwait(false);
        }

        if (command.BranchId is Guid newBranchId && newBranchId != current.CurrentBranchId)
        {
            await _userProfileService.SetCurrentBranchIdAsync(command.Id, newBranchId, cancellationToken).ConfigureAwait(false);
        }

        return Unit.Value;
    }

    /// <summary>
    /// Returns the role rows to assign when the requested set differs from the current one, or null when
    /// nothing changes. Only administrators may change roles; unknown role names are rejected.
    /// </summary>
    private async Task<List<UserRoleDto>?> PlanRoleChangeAsync(AdminUpdateUserCommand command, CancellationToken cancellationToken)
    {
        var current = await _userService.GetUserRolesAsync(command.Id, cancellationToken).ConfigureAwait(false);
        var desired = new HashSet<string>(command.Roles!, StringComparer.OrdinalIgnoreCase);

        var unknown = desired
            .Where(name => !current.Any(r => string.Equals(r.RoleName, name, StringComparison.OrdinalIgnoreCase)))
            .ToList();
        if (unknown.Count > 0)
        {
            throw new CustomException(
                $"Unknown role(s): {string.Join(", ", unknown)}.",
                Array.Empty<string>(),
                HttpStatusCode.BadRequest);
        }

        var planned = current
            .Select(r => new UserRoleDto
            {
                RoleId = r.RoleId,
                RoleName = r.RoleName,
                Description = r.Description,
                Enabled = desired.Contains(r.RoleName!),
            })
            .ToList();

        bool changed = current.Zip(planned).Any(pair => pair.First.Enabled != pair.Second.Enabled);
        if (!changed)
        {
            return null;
        }

        var actorRoles = await _userService.GetUserRolesAsync(_currentUser.GetUserId().ToString(), cancellationToken)
            .ConfigureAwait(false);
        if (!actorRoles.Any(r => r.Enabled && string.Equals(r.RoleName, RoleConstants.Admin, StringComparison.Ordinal)))
        {
            throw new ForbiddenException("Only administrators can change user roles.");
        }

        return planned;
    }
}
