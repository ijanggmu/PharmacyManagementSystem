using FluentValidation;
using FSH.Modules.Identity.Contracts.v1.Users.AdminSetPassword;

namespace FSH.Modules.Identity.Features.v1.Users.AdminSetPassword;

public sealed class AdminSetPasswordCommandValidator : AbstractValidator<AdminSetPasswordCommand>
{
    public AdminSetPasswordCommandValidator()
    {
        RuleFor(x => x.UserId)
            .NotEmpty().WithMessage("User ID is required.");

        // Mirrors the Identity password options (IdentityModule: length + digit/lower/upper) so the caller
        // gets field-level messages. UserManager re-checks the same policy when the password is set.
        RuleFor(x => x.NewPassword).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Enter a new password.")
            .MinimumLength(IdentityModuleConstants.PasswordLength)
            .WithMessage($"Password must be at least {IdentityModuleConstants.PasswordLength} characters.")
            .MaximumLength(128).WithMessage("Password must be at most 128 characters.")
            .Matches("[0-9]").WithMessage("Password must contain a number.")
            .Matches("[a-z]").WithMessage("Password must contain a lowercase letter.")
            .Matches("[A-Z]").WithMessage("Password must contain an uppercase letter.");

        RuleFor(x => x.ConfirmNewPassword)
            .Equal(x => x.NewPassword).WithMessage("Passwords do not match.");
    }
}
