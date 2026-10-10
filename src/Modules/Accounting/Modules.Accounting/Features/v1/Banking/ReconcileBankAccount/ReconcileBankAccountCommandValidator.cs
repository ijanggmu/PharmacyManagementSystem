using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.ReconcileBankAccount;

public sealed class ReconcileBankAccountCommandValidator : AbstractValidator<ReconcileBankAccountCommand>
{
    public ReconcileBankAccountCommandValidator()
    {
        RuleFor(x => x.StatementBalance).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.Notes).MaximumLength(1024);
    }
}
