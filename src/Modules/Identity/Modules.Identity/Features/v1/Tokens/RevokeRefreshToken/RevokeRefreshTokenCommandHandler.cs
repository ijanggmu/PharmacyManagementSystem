using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Tokens.RevokeRefreshToken;
using Mediator;

namespace FSH.Modules.Identity.Features.v1.Tokens.RevokeRefreshToken;

public sealed class RevokeRefreshTokenCommandHandler(IIdentityService identityService)
    : ICommandHandler<RevokeRefreshTokenCommand, Unit>
{
    public async ValueTask<Unit> Handle(RevokeRefreshTokenCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        await identityService.RevokeRefreshTokenAsync(command.RefreshToken, cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}
