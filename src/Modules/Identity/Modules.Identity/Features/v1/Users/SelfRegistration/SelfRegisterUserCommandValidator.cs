using FluentValidation;
using FSH.Modules.Identity.Contracts.v1.Users.SelfRegisterUser;

namespace FSH.Modules.Identity.Features.v1.Users.SelfRegistration;

public sealed class SelfRegisterUserCommandValidator : AbstractValidator<SelfRegisterUserCommand>
{
    public SelfRegisterUserCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.UserName).NotEmpty().MinimumLength(3).MaximumLength(50);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(IdentityModuleConstants.PasswordLength);
        RuleFor(x => x.ConfirmPassword)
            .NotEmpty()
            .Equal(x => x.Password).WithMessage("Passwords do not match.");
        RuleFor(x => x.PhoneNumber).MaximumLength(20).When(x => x.PhoneNumber is not null);
    }
}
