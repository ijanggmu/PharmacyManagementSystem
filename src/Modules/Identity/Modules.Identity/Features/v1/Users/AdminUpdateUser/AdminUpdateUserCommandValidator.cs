using FluentValidation;
using FSH.Modules.Identity.Contracts.v1.Users.AdminUpdateUser;

namespace FSH.Modules.Identity.Features.v1.Users.AdminUpdateUser;

public sealed class AdminUpdateUserCommandValidator : AbstractValidator<AdminUpdateUserCommand>
{
    public AdminUpdateUserCommandValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty().WithMessage("User ID is required.");

        RuleFor(x => x.FirstName)
            .NotEmpty().WithMessage("First name is required.")
            .MaximumLength(50);

        RuleFor(x => x.LastName)
            .MaximumLength(50)
            .When(x => !string.IsNullOrWhiteSpace(x.LastName));

        RuleFor(x => x.PhoneNumber)
            .MaximumLength(15)
            .When(x => !string.IsNullOrWhiteSpace(x.PhoneNumber));

        RuleForEach(x => x.Roles)
            .NotEmpty().WithMessage("Role names cannot be empty.")
            .When(x => x.Roles is not null);
    }
}
