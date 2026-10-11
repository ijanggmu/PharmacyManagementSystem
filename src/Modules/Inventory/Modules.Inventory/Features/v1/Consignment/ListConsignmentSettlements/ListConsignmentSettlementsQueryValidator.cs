using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Consignment;

namespace FSH.Modules.Inventory.Features.v1.Consignment.ListConsignmentSettlements;

public sealed class ListConsignmentSettlementsQueryValidator : AbstractValidator<ListConsignmentSettlementsQuery>
{
    public ListConsignmentSettlementsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
