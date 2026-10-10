using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.v1.TwoFactor;
using FSH.Modules.Identity.Domain;
using Mediator;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Identity.Features.v1.TwoFactor.VerifyEnroll;

public sealed class VerifyEnrollTwoFactorCommandHandler
    : ICommandHandler<VerifyEnrollTwoFactorCommand, TwoFactorVerifyResponse>
{
    private readonly UserManager<FshUser> _userManager;
    private readonly ICurrentUser _currentUser;
    private readonly ILogger<VerifyEnrollTwoFactorCommandHandler> _logger;

    public VerifyEnrollTwoFactorCommandHandler(
        UserManager<FshUser> userManager,
        ICurrentUser currentUser,
        ILogger<VerifyEnrollTwoFactorCommandHandler> logger)
    {
        _userManager = userManager;
        _currentUser = currentUser;
        _logger = logger;
    }

    public async ValueTask<TwoFactorVerifyResponse> Handle(
        VerifyEnrollTwoFactorCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!_currentUser.IsAuthenticated())
        {
            throw new UnauthorizedException();
        }

        var userId = _currentUser.GetUserId().ToString();
        var user = await _userManager.FindByIdAsync(userId).ConfigureAwait(false)
            ?? throw new NotFoundException($"User {userId} not found.");

        var sanitized = command.Code.Replace(" ", string.Empty, StringComparison.Ordinal);
        var valid = await _userManager.VerifyTwoFactorTokenAsync(
            user,
            _userManager.Options.Tokens.AuthenticatorTokenProvider,
            sanitized).ConfigureAwait(false);

        if (!valid)
        {
            throw new CustomException(
                "The authenticator code is invalid.",
                errors: null,
                System.Net.HttpStatusCode.BadRequest);
        }

        await _userManager.SetTwoFactorEnabledAsync(user, true).ConfigureAwait(false);

        // A fresh set on every (re-)enrollment: earlier codes stop working.
        var recoveryCodes = await _userManager
            .GenerateNewTwoFactorRecoveryCodesAsync(user, TwoFactorDefaults.RecoveryCodeCount)
            .ConfigureAwait(false);

        if (_logger.IsEnabled(LogLevel.Information))
        {
            _logger.LogInformation("User {UserId} enabled two-factor authentication", user.Id);
        }

        return new TwoFactorVerifyResponse(true, recoveryCodes?.ToList() ?? []);
    }
}
