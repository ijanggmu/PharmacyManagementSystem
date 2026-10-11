using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.ResetOpeningBalances;

public sealed class ResetOpeningBalancesCommandValidator : AbstractValidator<ResetOpeningBalancesCommand>
{
    public ResetOpeningBalancesCommandValidator()
    {
        RuleFor(x => x.RequestId).NotEmpty();
        RuleFor(x => x.ExpectedVersion).GreaterThan(0);
        RuleFor(x => x.Reason).NotEmpty().WithMessage("A reason is required to reset opening balances.")
            .MaximumLength(OpeningBalanceRules.MaxReasonLength);
    }
}
