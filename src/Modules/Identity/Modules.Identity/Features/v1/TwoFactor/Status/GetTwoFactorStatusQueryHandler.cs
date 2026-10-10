using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.v1.TwoFactor;
using FSH.Modules.Identity.Domain;
using Mediator;
using Microsoft.AspNetCore.Identity;

namespace FSH.Modules.Identity.Features.v1.TwoFactor.Status;

public sealed class GetTwoFactorStatusQueryHandler
    : IQueryHandler<GetTwoFactorStatusQuery, TwoFactorStatusResponse>
{
    private readonly UserManager<FshUser> _userManager;
    private readonly ICurrentUser _currentUser;

    public GetTwoFactorStatusQueryHandler(UserManager<FshUser> userManager, ICurrentUser currentUser)
    {
        _userManager = userManager;
        _currentUser = currentUser;
    }

    public async ValueTask<TwoFactorStatusResponse> Handle(
        GetTwoFactorStatusQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (!_currentUser.IsAuthenticated())
        {
            throw new UnauthorizedException();
        }

        var userId = _currentUser.GetUserId().ToString();
        var user = await _userManager.FindByIdAsync(userId).ConfigureAwait(false)
            ?? throw new NotFoundException($"User {userId} not found.");

        var enabled = await _userManager.GetTwoFactorEnabledAsync(user).ConfigureAwait(false);
        var left = enabled
            ? await _userManager.CountRecoveryCodesAsync(user).ConfigureAwait(false)
            : 0;

        return new TwoFactorStatusResponse(enabled, left);
    }
}
