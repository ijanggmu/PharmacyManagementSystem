using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.v1.TwoFactor;
using FSH.Modules.Identity.Domain;
using Mediator;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Identity.Features.v1.TwoFactor.RecoveryCodes;

public sealed class RegenerateRecoveryCodesCommandHandler
    : ICommandHandler<RegenerateRecoveryCodesCommand, TwoFactorRecoveryCodesResponse>
{
    private readonly UserManager<FshUser> _userManager;
    private readonly ICurrentUser _currentUser;
    private readonly ILogger<RegenerateRecoveryCodesCommandHandler> _logger;

    public RegenerateRecoveryCodesCommandHandler(
        UserManager<FshUser> userManager,
        ICurrentUser currentUser,
        ILogger<RegenerateRecoveryCodesCommandHandler> logger)
    {
        _userManager = userManager;
        _currentUser = currentUser;
        _logger = logger;
    }

    public async ValueTask<TwoFactorRecoveryCodesResponse> Handle(
        RegenerateRecoveryCodesCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!_currentUser.IsAuthenticated())
        {
            throw new UnauthorizedException();
        }

        var userId = _currentUser.GetUserId().ToString();
        var user = await _userManager.FindByIdAsync(userId).ConfigureAwait(false)
            ?? throw new NotFoundException($"User {userId} not found.");

        // Same confirmation as disabling 2FA: a stolen access token alone must not be able to mint codes.
        if (!await _userManager.CheckPasswordAsync(user, command.CurrentPassword).ConfigureAwait(false))
        {
            throw new UnauthorizedException("Current password is incorrect.");
        }

        if (!await _userManager.GetTwoFactorEnabledAsync(user).ConfigureAwait(false))
        {
            throw new CustomException(
                "Two-step verification is not turned on for this account.",
                errors: null,
                System.Net.HttpStatusCode.BadRequest);
        }

        var codes = await _userManager
            .GenerateNewTwoFactorRecoveryCodesAsync(user, TwoFactorDefaults.RecoveryCodeCount)
            .ConfigureAwait(false);

        if (_logger.IsEnabled(LogLevel.Information))
        {
            _logger.LogInformation("User {UserId} regenerated two-factor recovery codes", user.Id);
        }

        return new TwoFactorRecoveryCodesResponse(codes?.ToList() ?? []);
    }
}
