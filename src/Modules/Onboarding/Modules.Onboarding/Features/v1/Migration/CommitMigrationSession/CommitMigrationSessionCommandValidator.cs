using FluentValidation;
using FSH.Modules.Onboarding.Contracts.v1.Migration;

namespace FSH.Modules.Onboarding.Features.v1.Migration.CommitMigrationSession;

public sealed class CommitMigrationSessionCommandValidator : AbstractValidator<CommitMigrationSessionCommand>
{
    public CommitMigrationSessionCommandValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
    }
}
