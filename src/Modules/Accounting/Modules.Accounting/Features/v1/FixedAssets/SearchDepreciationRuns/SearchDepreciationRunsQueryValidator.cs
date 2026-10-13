using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.SearchDepreciationRuns;

public sealed class SearchDepreciationRunsQueryValidator : AbstractValidator<SearchDepreciationRunsQuery>
{
    public SearchDepreciationRunsQueryValidator()
    {
        RuleFor(x => x.FiscalYear!.Value).InclusiveBetween(2000, 2200).When(x => x.FiscalYear is not null);
    }
}
