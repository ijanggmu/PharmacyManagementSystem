using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Sales;

namespace FSH.Modules.Sales.Features.v1.Sales.GetReversalPreview;

public sealed class GetReversalSettlementPreviewQueryValidator : AbstractValidator<GetReversalSettlementPreviewQuery>
{
    public GetReversalSettlementPreviewQueryValidator()
    {
        RuleFor(x => x.SaleId).NotEmpty();
        RuleFor(x => x.Amount).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.RefundMethod).MaximumLength(32);
    }
}
