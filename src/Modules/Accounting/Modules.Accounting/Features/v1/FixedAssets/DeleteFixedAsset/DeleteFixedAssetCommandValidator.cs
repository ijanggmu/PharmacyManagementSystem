using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.DeleteFixedAsset;

public sealed class DeleteFixedAssetCommandValidator : AbstractValidator<DeleteFixedAssetCommand>
{
    public DeleteFixedAssetCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}
