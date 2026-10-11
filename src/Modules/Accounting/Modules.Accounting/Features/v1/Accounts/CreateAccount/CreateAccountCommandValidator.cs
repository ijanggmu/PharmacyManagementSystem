using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Accounts;

namespace FSH.Modules.Accounting.Features.v1.Accounts.CreateAccount;

public sealed class CreateAccountCommandValidator : AbstractValidator<CreateAccountCommand>
{
    public CreateAccountCommandValidator()
    {
        RuleFor(x => x.ParentId).NotEmpty().WithMessage("Choose the parent account.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(256);
    }
}
