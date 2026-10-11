using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Accounts;

namespace FSH.Modules.Accounting.Features.v1.Accounts.DeactivateAccount;

public sealed class DeactivateAccountCommandValidator : AbstractValidator<DeactivateAccountCommand>
{
    public DeactivateAccountCommandValidator()
    {
        RuleFor(x => x.AccountId).NotEmpty();
    }
}
