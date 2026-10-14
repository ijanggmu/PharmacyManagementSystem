using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.ReconcileBankAccount;

public sealed class ReconcileBankAccountCommandValidator : AbstractValidator<ReconcileBankAccountCommand>
{
    public ReconcileBankAccountCommandValidator()
    {
        // A statement balance may be negative: an overdrawn account.
        RuleFor(x => x.AsOfUtc).BusinessDate("statement date");
        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x.AccountId).Must(id => id is null || id != Guid.Empty).WithMessage("Choose the account to reconcile.");
    }
}
