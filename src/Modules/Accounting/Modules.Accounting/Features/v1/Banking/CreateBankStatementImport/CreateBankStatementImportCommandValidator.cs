using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Banking;

namespace FSH.Modules.Accounting.Features.v1.Banking.CreateBankStatementImport;

public sealed class CreateBankStatementImportCommandValidator : AbstractValidator<CreateBankStatementImportCommand>
{
    /// <summary>Rounding slack between the statement's own closing balance and opening + lines.</summary>
    private const decimal BalanceTolerance = 0.01m;

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
            .WithMessage("A statement import cannot contain more than 2000 lines.")
            .When(x => x.Lines is not null);
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.DebitAmount).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.CreditAmount).GreaterThanOrEqualTo(0m);
        });

        // Both balances given: the statement must add up (money in is a debit, money out a credit, as on the ledger).
        RuleFor(x => x.ClosingBalance)
            .Must((x, closing) => Math.Abs(ExpectedClosing(x) - closing!.Value) <= BalanceTolerance)
            .When(x => x.OpeningBalance is not null && x.ClosingBalance is not null && x.Lines is { Count: > 0 })
            .WithMessage(x =>
                $"The statement doesn't add up: opening {x.OpeningBalance:N2} + money in − money out = {ExpectedClosing(x):N2}, " +
                $"but the closing balance is {x.ClosingBalance:N2}. Check for a missing or mistyped line.");
    }

    private static decimal ExpectedClosing(CreateBankStatementImportCommand command) =>
        (command.OpeningBalance ?? 0m) + command.Lines.Sum(l => l.DebitAmount - l.CreditAmount);
}
