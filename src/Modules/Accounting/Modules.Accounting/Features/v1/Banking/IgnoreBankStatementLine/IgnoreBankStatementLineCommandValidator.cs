using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.IgnoreBankStatementLine;

public sealed class IgnoreBankStatementLineCommandValidator : AbstractValidator<IgnoreBankStatementLineCommand>
{
    public IgnoreBankStatementLineCommandValidator()
    {
        RuleFor(x => x.LineId).NotEmpty();
        RuleFor(x => x.Note).MaximumLength(500);
    }
}
