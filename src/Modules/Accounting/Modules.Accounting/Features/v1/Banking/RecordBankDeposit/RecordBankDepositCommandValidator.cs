using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.RecordBankDeposit;

public sealed class RecordBankDepositCommandValidator : AbstractValidator<RecordBankDepositCommand>
{
    public RecordBankDepositCommandValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0m);
        RuleFor(x => x.Description).MaximumLength(1024);
    }
}
