using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Jobs.Services;
using FSH.Framework.Mailing;
using FSH.Framework.Mailing.Services;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using System.Collections.ObjectModel;
using System.Text;

namespace FSH.Modules.Identity.Services;

internal sealed class UserPasswordService(
    UserManager<FshUser> userManager,
    IdentityDbContext db,
    IJobService jobService,
    IMailService mailService,
    IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
    IPasswordHistoryService passwordHistoryService,
    IPasswordExpiryService passwordExpiryService,
    ISessionService sessionService) : IUserPasswordService
{
    private const string SystemActor = "system";

    public async Task ForgotPasswordAsync(string email, string origin, CancellationToken cancellationToken)
    {
        EnsureValidTenant();

        var user = await userManager.FindByEmailAsync(email);

        // Anti-enumeration: respond identically regardless of registration — a real user gets the
        // reset email; an unknown or email-less account silently no-ops with the same 200.
        if (user is null || string.IsNullOrWhiteSpace(user.Email))
        {
            return;
        }

        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        token = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

        // Build the SPA reset link with QueryHelpers (matches GetEmailVerificationUriAsync): trim any trailing
        // slash from the configured origin (Uri.ToString adds one for a host-only URL → "//reset-password"
        // misses the client route) and include the tenant the reset page requires. QueryHelpers URL-encodes
        // each value, so reserved chars in the email (e.g. '+') survive.
        var resetPasswordUri = QueryHelpers.AddQueryString(
            $"{origin.TrimEnd('/')}/reset-password",
            new Dictionary<string, string?>
            {
                ["token"] = token,
                ["email"] = email,
                ["tenant"] = multiTenantContextAccessor?.MultiTenantContext?.TenantInfo?.Id,
            });
        var mailRequest = new MailRequest(
            new Collection<string> { user.Email },
            "Reset Password",
            $"Please reset your password using the following link: {resetPasswordUri}");

        jobService.Enqueue(() => mailService.SendAsync(mailRequest, CancellationToken.None));
    }

    public async Task ResetPasswordAsync(string email, string password, string token, CancellationToken cancellationToken)
    {
        EnsureValidTenant();

        var user = await userManager.FindByEmailAsync(email);
        if (user == null)
        {
            throw new NotFoundException("user not found");
        }

        token = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
        var result = await userManager.ResetPasswordAsync(user, token, password);

        if (!result.Succeeded)
        {
            var errors = result.Errors.Select(e => e.Description).ToList();
            throw new CustomException("error resetting password", errors);
        }

        // Raise domain event for password reset
        var tenantId = multiTenantContextAccessor?.MultiTenantContext?.TenantInfo?.Id;
        user.RecordPasswordChanged(wasReset: true, tenantId);

        // A reset means the old password may be compromised: kill every way back in with it.
        // ResetPasswordAsync already rotated the security stamp; also drop the stored refresh token
        // (sessions are tracked best-effort, so a token without a session row would still refresh)
        // and revoke every tracked session.
        user.RefreshToken = null;
        await db.SaveChangesAsync(cancellationToken);
        await sessionService.RevokeAllSessionsForAdminAsync(user.Id, SystemActor, "Password reset", cancellationToken);

        await passwordExpiryService.UpdateLastPasswordChangeDateAsync(user.Id, cancellationToken);
        await passwordHistoryService.SavePasswordHistoryAsync(user.Id, cancellationToken);
    }

    public async Task ChangePasswordAsync(string password, string newPassword, string confirmNewPassword, string userId, CancellationToken cancellationToken = default)
    {
        var user = await userManager.FindByIdAsync(userId);

        _ = user ?? throw new NotFoundException("user not found");

        // The current-password check is a password oracle for anyone holding a stolen access token: apply the
        // same lockout rules as sign-in (locked → 423, every wrong current password counts toward lockout).
        if (userManager.SupportsUserLockout && await userManager.IsLockedOutAsync(user))
        {
            throw new CustomException(
                "Account is temporarily locked due to too many failed attempts. Try again later.",
                errors: null,
                System.Net.HttpStatusCode.Locked);
        }

        if (!await userManager.CheckPasswordAsync(user, password))
        {
            if (userManager.SupportsUserLockout)
            {
                await userManager.AccessFailedAsync(user);
            }

            throw new CustomException("failed to change password", ["Incorrect password."], System.Net.HttpStatusCode.BadRequest);
        }

        var result = await userManager.ChangePasswordAsync(user, password, newPassword);

        if (!result.Succeeded)
        {
            var errors = result.Errors.Select(e => e.Description).ToList();
            throw new CustomException("failed to change password", errors, System.Net.HttpStatusCode.BadRequest);
        }

        if (userManager.SupportsUserLockout && await userManager.GetAccessFailedCountAsync(user) > 0)
        {
            await userManager.ResetAccessFailedCountAsync(user);
        }

        // Raise domain event for password change
        var tenantId = multiTenantContextAccessor?.MultiTenantContext?.TenantInfo?.Id;
        user.RecordPasswordChanged(wasReset: false, tenantId);

        // ChangePasswordAsync rotated the security stamp. Sign out every other device as well: drop the
        // stored refresh token and revoke all tracked sessions (the caller's own session included — its
        // access token stays valid until expiry, then the user signs in again with the new password).
        user.RefreshToken = null;
        await db.SaveChangesAsync(cancellationToken);
        await sessionService.RevokeAllSessionsForAdminAsync(user.Id, userId, "Password changed", cancellationToken);

        // Update password expiry date
        await passwordExpiryService.UpdateLastPasswordChangeDateAsync(userId, cancellationToken);

        // Save to history
        await passwordHistoryService.SavePasswordHistoryAsync(userId, cancellationToken);
    }

    private void EnsureValidTenant()
    {
        if (string.IsNullOrWhiteSpace(multiTenantContextAccessor?.MultiTenantContext?.TenantInfo?.Id))
        {
            throw new UnauthorizedException("invalid tenant");
        }
    }
}