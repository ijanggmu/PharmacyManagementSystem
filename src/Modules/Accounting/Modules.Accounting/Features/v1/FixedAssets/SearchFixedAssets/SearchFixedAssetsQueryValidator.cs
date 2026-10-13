using FluentValidation;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.SearchFixedAssets;

public sealed class SearchFixedAssetsQueryValidator : AbstractValidator<SearchFixedAssetsQuery>
{
    public SearchFixedAssetsQueryValidator()
    {
        RuleFor(x => x.Status)
            .Must(s => s is null
                || string.Equals(s, FixedAssetValues.Statuses.Active, StringComparison.OrdinalIgnoreCase)
                || string.Equals(s, FixedAssetValues.Statuses.Disposed, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Status must be active or disposed.");
        RuleFor(x => x.Search).MaximumLength(100);
    }
}
