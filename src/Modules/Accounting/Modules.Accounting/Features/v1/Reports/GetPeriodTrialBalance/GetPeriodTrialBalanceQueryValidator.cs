using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetPeriodTrialBalance;

public sealed class GetPeriodTrialBalanceQueryValidator : AbstractValidator<GetPeriodTrialBalanceQuery>
{
    public GetPeriodTrialBalanceQueryValidator()
    {
        RuleFor(x => x.FromUtc).NotEmpty();
        RuleFor(x => x.ToUtc).NotEmpty().GreaterThanOrEqualTo(x => x.FromUtc);
    }
}
