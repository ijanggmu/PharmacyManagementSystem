using FSH.Modules.Sales.Contracts.v1.Ird;
using FluentValidation;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;

public sealed class GetIrdSalesRegisterQueryValidator : AbstractValidator<GetIrdSalesRegisterQuery>
{
    public GetIrdSalesRegisterQueryValidator()
    {
        RuleFor(q => q.PeriodEndUtc)
            .GreaterThanOrEqualTo(q => q.PeriodStartUtc)
            .WithMessage("periodEndUtc must be on or after periodStartUtc.");
    }
}
