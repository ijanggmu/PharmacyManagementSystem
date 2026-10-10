using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.EditOpeningBalances;

public sealed class EditOpeningBalancesCommandValidator : AbstractValidator<EditOpeningBalancesCommand>
{
    public EditOpeningBalancesCommandValidator()
    {
        RuleFor(x => x.RequestId).NotEmpty();
        RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.OpeningDate)
            .Must(OpeningBalanceLineInputValidator.NotInFuture)
            .WithMessage("The opening date can not be in the future.");
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Enter at least one opening balance.");
        RuleFor(x => x.Lines.Count).LessThanOrEqualTo(OpeningBalanceLineInputValidator.MaxLines).When(x => x.Lines is not null);
        RuleForEach(x => x.Lines).SetValidator(new OpeningBalanceLineInputValidator());
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A reason is required to edit opening balances.")
            .MaximumLength(OpeningBalanceRules.MaxReasonLength);
    }
}
