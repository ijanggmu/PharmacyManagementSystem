using FluentValidation;
using FSH.Modules.Onboarding.Contracts.v1.Onboarding;

namespace FSH.Modules.Onboarding.Features.v1.Onboarding.CompleteOnboarding;

public sealed class CompleteOnboardingCommandValidator : AbstractValidator<CompleteOnboardingCommand>
{
    public CompleteOnboardingCommandValidator()
    {
        RuleFor(x => x.OpeningCash).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.OpeningBank).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.OpeningInventoryValue).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.OpeningAccountsReceivable).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.OpeningAccountsPayable).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x)
            .Must(x => x.OpeningCash > 0 || x.OpeningBank > 0 || x.OpeningInventoryValue > 0
                || x.OpeningAccountsReceivable > 0 || x.OpeningAccountsPayable > 0)
            .WithMessage("At least one opening balance must be greater than zero.");
    }
}
