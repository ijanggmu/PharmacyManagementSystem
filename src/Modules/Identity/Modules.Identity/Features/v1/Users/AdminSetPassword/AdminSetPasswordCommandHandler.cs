using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Users.AdminSetPassword;
using FSH.Modules.Identity.Domain;
using Mediator;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Identity.Features.v1.Users.AdminSetPassword;

public sealed class AdminSetPasswordCommandHandler(
    UserManager<FshUser> userManager,
    IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
    ICurrentUser currentUser,
    ISessionService sessionService,
    IPasswordExpiryService passwordExpiryService,
    IPasswordHistoryService passwordHistoryService,
    ISecurityAudit securityAudit,
    ILogger<AdminSetPasswordCommandHandler> logger)
    : ICommandHandler<AdminSetPasswordCommand, Unit>
{
    private const string RevokeReason = "Password set by administrator";

    public async ValueTask<Unit> Handle(AdminSetPasswordCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var tenantId = multiTenantContextAccessor.MultiTenantContext?.TenantInfo?.Id;
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            throw new UnauthorizedException("invalid tenant");
        }

        var actorId = currentUser.GetUserId().ToString();

        // Your own password goes through Change password, which checks the current one first.
        if (string.Equals(actorId, command.UserId, StringComparison.OrdinalIgnoreCase))
        {
            throw new CustomException(
                "Use Change password on your profile to change your own password.",
                errors: null,
                System.Net.HttpStatusCode.BadRequest);
        }

        // Same rule as activate/deactivate/delete: only an Admin may do this. Otherwise anyone granted
        // Users.Update could set an Admin's password and sign in as them.
        if (!await IsAdministratorAsync(actorId).ConfigureAwait(false))
        {
            throw new ForbiddenException("Only administrators can set another user's password.");
        }

        // The tenant filter on Users scopes this lookup to the caller's tenant (same as AdminResetTwoFactor).
        var user = await userManager.Users
            .Where(u => u.Id == command.UserId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"User {command.UserId} was not found.");

        // Set before ResetPasswordAsync, whose UpdateAsync persists them: drop the stored refresh token
        // (session rows are best-effort) and raise the password-changed domain event.
        user.RefreshToken = null;
        user.RecordPasswordChanged(wasReset: true, tenantId);

        // Reset token + ResetPasswordAsync runs the configured password validators and rotates the
        // security stamp, so the user's existing tokens stop validating.
        var token = await userManager.GeneratePasswordResetTokenAsync(user).ConfigureAwait(false);
        var result = await userManager.ResetPasswordAsync(user, token, command.NewPassword).ConfigureAwait(false);
        if (!result.Succeeded)
        {
            throw new CustomException(
                "Could not set the password.",
                result.Errors.Select(e => e.Description).ToList(),
                System.Net.HttpStatusCode.BadRequest);
        }

        // The usual reason for an admin reset is a forgotten password, which often means a lockout too.
        await userManager.SetLockoutEndDateAsync(user, null).ConfigureAwait(false);
        await userManager.ResetAccessFailedCountAsync(user).ConfigureAwait(false);

        var revoked = await sessionService
            .RevokeAllSessionsForAdminAsync(user.Id, actorId, RevokeReason, cancellationToken)
            .ConfigureAwait(false);

        await passwordExpiryService.UpdateLastPasswordChangeDateAsync(user.Id, cancellationToken).ConfigureAwait(false);
        await passwordHistoryService.SavePasswordHistoryAsync(user.Id, cancellationToken).ConfigureAwait(false);
        await securityAudit.PasswordChangedAsync(user.Id, user.UserName ?? user.Email, wasReset: true, cancellationToken).ConfigureAwait(false);

        logger.LogWarning(
            "Admin {AdminId} set a new password for user {UserId} in tenant {TenantId}; revoked {SessionCount} sessions",
            actorId,
            user.Id,
            tenantId,
            revoked);

        return Unit.Value;
    }

    private async Task<bool> IsAdministratorAsync(string actorId)
    {
        // The root operator acts on another tenant's users (tenant header override), where they have no
        // user row; their root Admin role is authority enough (same rule as RoleService).
        if (string.Equals(currentUser.GetTenant(), MultitenancyConstants.Root.Id, StringComparison.Ordinal)
            && currentUser.IsInRole(RoleConstants.Admin))
        {
            return true;
        }

        var actor = await userManager.FindByIdAsync(actorId).ConfigureAwait(false);
        return actor is not null && await userManager.IsInRoleAsync(actor, RoleConstants.Admin).ConfigureAwait(false);
    }
}
