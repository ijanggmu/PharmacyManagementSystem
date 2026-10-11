using FluentValidation;
using FSH.Modules.Multitenancy.Contracts.v1.DeactivateBranch;

namespace FSH.Modules.Multitenancy.Features.v1.DeactivateBranch;

public sealed class DeactivateBranchCommandValidator : AbstractValidator<DeactivateBranchCommand>
{
    public DeactivateBranchCommandValidator()
    {
        RuleFor(b => b.Id).NotEmpty();
    }
}
