using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Reports;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetExpiredBatches;

public sealed class GetExpiredBatchesQueryValidator : AbstractValidator<GetExpiredBatchesQuery>
{
    public GetExpiredBatchesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
