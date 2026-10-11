using FluentValidation;
using FSH.Modules.Identity.Contracts.v1.TwoFactor;

namespace FSH.Modules.Identity.Features.v1.TwoFactor.RecoveryCodes;

public sealed class RegenerateRecoveryCodesCommandValidator : AbstractValidator<RegenerateRecoveryCodesCommand>
{
    public RegenerateRecoveryCodesCommandValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
    }
}
