using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Accounts;

namespace FSH.Modules.Accounting.Features.v1.Accounts.UpdateAccount;

public sealed class UpdateAccountCommandValidator : AbstractValidator<UpdateAccountCommand>
{
    public UpdateAccountCommandValidator()
    {
        RuleFor(x => x.AccountId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(256);
    }
}
