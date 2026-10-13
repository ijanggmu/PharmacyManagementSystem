using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts.CreateCashBankAccount;

public sealed class CreateCashBankAccountCommandValidator : AbstractValidator<CreateCashBankAccountCommand>
{
    public CreateCashBankAccountCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name the account, e.g. \"Nabil Bank – current\".").MaximumLength(256);
    }
}
