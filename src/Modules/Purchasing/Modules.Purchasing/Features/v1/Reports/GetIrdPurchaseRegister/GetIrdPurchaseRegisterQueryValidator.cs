using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FluentValidation;

namespace FSH.Modules.Purchasing.Features.v1.Reports.GetIrdPurchaseRegister;

public sealed class GetIrdPurchaseRegisterQueryValidator : AbstractValidator<GetIrdPurchaseRegisterQuery>
{
    public GetIrdPurchaseRegisterQueryValidator()
    {
        RuleFor(q => q.PeriodEndUtc)
            .GreaterThanOrEqualTo(q => q.PeriodStartUtc)
            .WithMessage("periodEndUtc must be on or after periodStartUtc.");
    }
}
