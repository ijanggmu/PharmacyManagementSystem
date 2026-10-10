using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Reports;

namespace FSH.Modules.Sales.Features.v1.Reports.GetNarcoticRegister;

public sealed class GetNarcoticRegisterQueryValidator : AbstractValidator<GetNarcoticRegisterQuery>
{
    public GetNarcoticRegisterQueryValidator()
    {
        RuleFor(x => x.PeriodEndUtc).GreaterThanOrEqualTo(x => x.PeriodStartUtc);
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
