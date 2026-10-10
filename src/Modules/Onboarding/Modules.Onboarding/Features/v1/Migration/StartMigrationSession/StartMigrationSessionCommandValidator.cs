using FluentValidation;
using FSH.Modules.Onboarding.Contracts.v1.Migration;

namespace FSH.Modules.Onboarding.Features.v1.Migration.StartMigrationSession;

public sealed class StartMigrationSessionCommandValidator : AbstractValidator<StartMigrationSessionCommand>
{
    public StartMigrationSessionCommandValidator()
    {
        RuleFor(x => x.CutoverDate).NotEqual(default(DateOnly)).WithMessage("Cutover date is required.");
        RuleFor(x => x.Notes).MaximumLength(1024);
    }
}
