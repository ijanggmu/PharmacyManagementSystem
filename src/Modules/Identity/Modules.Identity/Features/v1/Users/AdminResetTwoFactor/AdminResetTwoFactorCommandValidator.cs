using FluentValidation;
using FSH.Modules.Identity.Contracts.v1.Users.AdminResetTwoFactor;

namespace FSH.Modules.Identity.Features.v1.Users.AdminResetTwoFactor;

public sealed class AdminResetTwoFactorCommandValidator : AbstractValidator<AdminResetTwoFactorCommand>
{
    public AdminResetTwoFactorCommandValidator()
    {
        RuleFor(x => x.UserId)
            .NotEmpty().WithMessage("User ID is required.");
    }
}
