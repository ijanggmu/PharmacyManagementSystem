using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.MatchBankStatementLine;

public sealed class MatchBankStatementLineCommandValidator : AbstractValidator<MatchBankStatementLineCommand>
{
    public MatchBankStatementLineCommandValidator()
    {
        RuleFor(x => x.LineId).NotEmpty();
        RuleFor(x => x.VoucherLineId).NotEmpty();
    }
}
