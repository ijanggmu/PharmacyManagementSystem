using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.CreateBankStatementImport;

public sealed class CreateBankStatementImportCommandValidator : AbstractValidator<CreateBankStatementImportCommand>
{
    public CreateBankStatementImportCommandValidator()
    {
        RuleFor(x => x.AccountId).NotEmpty();
        RuleFor(x => x.StatementLabel).MaximumLength(200);
        RuleFor(x => x.PeriodEndUtc.Date)
            .GreaterThanOrEqualTo(x => x.PeriodStartUtc.Date)
            .WithMessage("Statement period end must be on or after the period start.");
        RuleFor(x => x.Lines)
            .NotEmpty()
            .WithMessage("At least one statement line is required.");
        RuleFor(x => x.Lines.Count)
            .LessThanOrEqualTo(2000)
            .WithMessage("A statement import cannot contain more than 2000 lines.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.DebitAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.CreditAmount).GreaterThanOrEqualTo(0m);
        });
    }
}
