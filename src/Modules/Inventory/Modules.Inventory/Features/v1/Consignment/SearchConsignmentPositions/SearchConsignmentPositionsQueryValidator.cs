using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Consignment;

namespace FSH.Modules.Inventory.Features.v1.Consignment.SearchConsignmentPositions;

public sealed class SearchConsignmentPositionsQueryValidator : AbstractValidator<SearchConsignmentPositionsQuery>
{
    public SearchConsignmentPositionsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
