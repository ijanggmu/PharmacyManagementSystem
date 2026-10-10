using System.Globalization;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Users.AdminResetTwoFactor;
using FSH.Modules.Identity.Domain;
using Mediator;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Identity.Features.v1.Users.AdminResetTwoFactor;

public sealed class AdminResetTwoFactorCommandHandler : ICommandHandler<AdminResetTwoFactorCommand, Unit>
{
    private const string RevokeReason = "Two-step verification reset by administrator";

    private readonly UserManager<FshUser> _userManager;
    private readonly IMultiTenantContextAccessor<AppTenantInfo> _multiTenantContextAccessor;
    private readonly ICurrentUser _currentUser;
    private readonly ISessionService _sessionService;
    private readonly IAuditClient _auditClient;
    private readonly ILogger<AdminResetTwoFactorCommandHandler> _logger;

    public AdminResetTwoFactorCommandHandler(
        UserManager<FshUser> userManager,
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        ICurrentUser currentUser,
        ISessionService sessionService,
        IAuditClient auditClient,
        ILogger<AdminResetTwoFactorCommandHandler> logger)
    {
        _userManager = userManager;
        _multiTenantContextAccessor = multiTenantContextAccessor;
        _currentUser = currentUser;
        _sessionService = sessionService;
        _auditClient = auditClient;
        _logger = logger;
    }

    public async ValueTask<Unit> Handle(AdminResetTwoFactorCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var tenantId = _multiTenantContextAccessor.MultiTenantContext?.TenantInfo?.Id;
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            throw new UnauthorizedException("invalid tenant");
        }

        var actorId = _currentUser.GetUserId().ToString();

        // Finbuckle's tenant filter on Users scopes this lookup to the caller's tenant, so an admin can
        // never reach a user in another tenant (same pattern as AdminConfirmEmail / ToggleUserStatus).
        var user = await _userManager.Users
            .Where(u => u.Id == command.UserId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"User {command.UserId} was not found.");

        // Drop the stored refresh token too: session rows are written best-effort at login, so a token
        // without a session row would otherwise still refresh.
        user.RefreshToken = null;

        var disabled = await _userManager.SetTwoFactorEnabledAsync(user, false).ConfigureAwait(false);
        if (!disabled.Succeeded)
        {
            throw new CustomException(string.Format(
                CultureInfo.InvariantCulture,
                "Could not reset two-step verification: {0}",
                string.Join("; ", disabled.Errors.Select(e => e.Description))));
        }

        // Rotates the TOTP secret (and the security stamp) so the old authenticator entry is useless.
        await _userManager.ResetAuthenticatorKeyAsync(user).ConfigureAwait(false);

        // Invalidate any remaining recovery codes; a re-enroll issues a fresh set.
        await _userManager.GenerateNewTwoFactorRecoveryCodesAsync(user, 0).ConfigureAwait(false);

        var revoked = await _sessionService
            .RevokeAllSessionsForAdminAsync(user.Id, actorId, RevokeReason, cancellationToken)
            .ConfigureAwait(false);

        _logger.LogWarning(
            "Admin {AdminId} reset two-factor authentication for user {UserId} in tenant {TenantId}; revoked {SessionCount} sessions",
            actorId,
            user.Id,
            tenantId,
            revoked);

        await _auditClient.WriteActivityAsync(
            ActivityKind.Command,
            name: "AdminResetTwoFactor",
            statusCode: 204,
            durationMs: 0,
            requestPreview: new { actorId, targetUserId = user.Id, tenant = tenantId },
            responsePreview: new { outcome = "success", revokedSessions = revoked },
            severity: AuditSeverity.Warning,
            source: "Identity",
            ct: cancellationToken).ConfigureAwait(false);

        return Unit.Value;
    }
}
