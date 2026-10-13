using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLossColumns;

public sealed class GetProfitAndLossColumnsQueryValidator : AbstractValidator<GetProfitAndLossColumnsQuery>
{
    public GetProfitAndLossColumnsQueryValidator()
    {
        RuleFor(x => x.Periods).NotEmpty();
        RuleFor(x => x.Periods)
            .Must(p => p.Count <= GetProfitAndLossColumnsQuery.MaxPeriods)
            .WithMessage($"At most {GetProfitAndLossColumnsQuery.MaxPeriods} periods can be compared at once.")
            .When(x => x.Periods is not null);
        RuleForEach(x => x.Periods).ChildRules(period =>
        {
            period.RuleFor(p => p.FromUtc).NotEmpty();
            period.RuleFor(p => p.ToUtc).NotEmpty().GreaterThanOrEqualTo(p => p.FromUtc);
        });
    }
}
