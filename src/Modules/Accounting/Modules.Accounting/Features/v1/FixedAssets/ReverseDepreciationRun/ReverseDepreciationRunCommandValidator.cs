using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.ReverseDepreciationRun;

public sealed class ReverseDepreciationRunCommandValidator : AbstractValidator<ReverseDepreciationRunCommand>
{
    public ReverseDepreciationRunCommandValidator()
    {
        RuleFor(x => x.RunId).NotEmpty();
    }
}
