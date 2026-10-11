using FluentValidation;
using FSH.Modules.Multitenancy.Contracts.v1.SwitchBranch;

namespace FSH.Modules.Multitenancy.Features.v1.SwitchBranch;

public sealed class SwitchBranchCommandValidator : AbstractValidator<SwitchBranchCommand>
{
    public SwitchBranchCommandValidator() =>
        RuleFor(b => b.BranchId)
            .NotEmpty();
}
