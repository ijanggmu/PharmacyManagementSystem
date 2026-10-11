using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Batches;

namespace FSH.Modules.Inventory.Features.v1.Batches.SearchBatches;

public sealed class SearchBatchesQueryValidator : AbstractValidator<SearchBatchesQuery>
{
    public SearchBatchesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
