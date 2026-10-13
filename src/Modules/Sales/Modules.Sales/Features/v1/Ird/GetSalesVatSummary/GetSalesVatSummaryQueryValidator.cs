using FSH.Modules.Sales.Contracts.v1.Ird;
using FluentValidation;

namespace FSH.Modules.Sales.Features.v1.Ird.GetSalesVatSummary;

public sealed class GetSalesVatSummaryQueryValidator : AbstractValidator<GetSalesVatSummaryQuery>
{
    public GetSalesVatSummaryQueryValidator()
    {
        RuleFor(q => q.PeriodEndUtc)
            .GreaterThanOrEqualTo(q => q.PeriodStartUtc)
            .WithMessage("periodEndUtc must be on or after periodStartUtc.");
    }
}
