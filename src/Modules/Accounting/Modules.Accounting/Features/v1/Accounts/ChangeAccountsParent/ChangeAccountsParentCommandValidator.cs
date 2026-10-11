using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Accounts;

namespace FSH.Modules.Accounting.Features.v1.Accounts.ChangeAccountsParent;

public sealed class ChangeAccountsParentCommandValidator : AbstractValidator<ChangeAccountsParentCommand>
{
    public const int MaxAccounts = 500;

    public ChangeAccountsParentCommandValidator()
    {
        RuleFor(x => x.AccountIds).NotEmpty()
            .Must(ids => ids.Count <= MaxAccounts)
            .WithMessage($"Move at most {MaxAccounts} accounts at a time.");
        RuleForEach(x => x.AccountIds).NotEmpty();
        RuleFor(x => x.TargetParentId).NotEmpty().WithMessage("Choose where to move the accounts.");
    }
}
