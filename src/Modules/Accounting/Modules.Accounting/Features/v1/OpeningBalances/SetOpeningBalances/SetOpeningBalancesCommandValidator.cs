using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.SetOpeningBalances;

public sealed class SetOpeningBalancesCommandValidator : AbstractValidator<SetOpeningBalancesCommand>
{
    public SetOpeningBalancesCommandValidator()
    {
        RuleFor(x => x.RequestId).NotEmpty();
        RuleFor(x => x.OpeningDate)
            .Must(OpeningBalanceLineInputValidator.NotInFuture)
            .WithMessage("The opening date can not be in the future.");
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Enter at least one opening balance.");
        RuleFor(x => x.Lines.Count).LessThanOrEqualTo(OpeningBalanceLineInputValidator.MaxLines).When(x => x.Lines is not null);
        RuleForEach(x => x.Lines).SetValidator(new OpeningBalanceLineInputValidator());
        RuleFor(x => x.Reason).MaximumLength(OpeningBalanceRules.MaxReasonLength);
    }
}
