using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Reports;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetDeadStock;

public sealed class GetDeadStockQueryValidator : AbstractValidator<GetDeadStockQuery>
{
    public GetDeadStockQueryValidator()
    {
        RuleFor(x => x.SinceDays).GreaterThanOrEqualTo(0);
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
