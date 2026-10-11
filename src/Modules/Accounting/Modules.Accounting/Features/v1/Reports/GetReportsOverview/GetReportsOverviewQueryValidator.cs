using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetReportsOverview;

public sealed class GetReportsOverviewQueryValidator : AbstractValidator<GetReportsOverviewQuery>
{
    public GetReportsOverviewQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc);
    }
}
