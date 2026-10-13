using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.UpdateFixedAsset;

public sealed class UpdateFixedAssetCommandValidator : AbstractValidator<UpdateFixedAssetCommand>
{
    public UpdateFixedAssetCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(FixedAsset.NameMaxLength);
        RuleFor(x => x.Category).NotEmpty().MaximumLength(FixedAsset.CategoryMaxLength);
        RuleFor(x => x.AssetTag).MaximumLength(FixedAsset.TagMaxLength);
        RuleFor(x => x.Location).MaximumLength(FixedAsset.LocationMaxLength);
        RuleFor(x => x.Notes).MaximumLength(FixedAsset.NotesMaxLength);

        // The cost is not on the command; the handler checks the residual value against the stored cost.
        FixedAssetTermsRules.Apply(this, _ => decimal.MaxValue, x => x.DepreciationMethod, x => x.TaxPool, x => x.ResidualValue,
            x => x.UsefulLifeMonths, x => x.RatePercent, x => x.TaxUsefulLifeYears);
    }
}
