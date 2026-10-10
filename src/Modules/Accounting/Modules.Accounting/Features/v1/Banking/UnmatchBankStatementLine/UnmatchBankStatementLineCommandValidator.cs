using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.UnmatchBankStatementLine;

public sealed class UnmatchBankStatementLineCommandValidator : AbstractValidator<UnmatchBankStatementLineCommand>
{
    public UnmatchBankStatementLineCommandValidator()
    {
        RuleFor(x => x.LineId).NotEmpty();
    }
}
