using FluentValidation;
using FSH.Modules.Identity.Contracts.v1.Tokens.RevokeRefreshToken;

namespace FSH.Modules.Identity.Features.v1.Tokens.RevokeRefreshToken;

public sealed class RevokeRefreshTokenCommandValidator : AbstractValidator<RevokeRefreshTokenCommand>
{
    public RevokeRefreshTokenCommandValidator()
    {
        RuleFor(x => x.RefreshToken).NotEmpty().MaximumLength(1024);
    }
}
