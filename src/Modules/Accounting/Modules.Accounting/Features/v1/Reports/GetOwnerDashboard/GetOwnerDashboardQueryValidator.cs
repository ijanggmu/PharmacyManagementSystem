using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetOwnerDashboard;

public sealed class GetOwnerDashboardQueryValidator : AbstractValidator<GetOwnerDashboardQuery>
{
    /// <summary>A Bikram Sambat month is at most 32 days; a little slack covers the time zone.</summary>
    public const int MaxMonthStartAgeDays = 40;

    public GetOwnerDashboardQueryValidator()
    {
        // A month start: not in the future and not more than one month back, so the endpoint cannot be
        // turned into an unbounded (and uncacheable) date-range report.
        RuleFor(x => x.MonthStartUtc)
            .Must(start => start is null
                || (start.Value <= DateTime.UtcNow.AddDays(1) && start.Value >= DateTime.UtcNow.AddDays(-MaxMonthStartAgeDays)))
            .WithMessage($"Month start must fall within the last {MaxMonthStartAgeDays} days.");
    }
}
