using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FluentValidation;

namespace FSH.Modules.Purchasing.Features.v1.Reports.GetPurchaseVatSummary;

public sealed class GetPurchaseVatSummaryQueryValidator : AbstractValidator<GetPurchaseVatSummaryQuery>
{
    public GetPurchaseVatSummaryQueryValidator()
    {
        RuleFor(q => q.PeriodEndUtc)
            .GreaterThanOrEqualTo(q => q.PeriodStartUtc)
            .WithMessage("periodEndUtc must be on or after periodStartUtc.");
    }
}
