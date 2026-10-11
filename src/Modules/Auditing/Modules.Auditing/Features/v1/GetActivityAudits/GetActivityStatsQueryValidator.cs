using FluentValidation;
using FSH.Modules.Auditing.Contracts.v1.GetActivityAudits;

namespace FSH.Modules.Auditing.Features.v1.GetActivityAudits;

public sealed class GetActivityStatsQueryValidator : AbstractValidator<GetActivityStatsQuery>
{
    public GetActivityStatsQueryValidator()
    {
        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");

        RuleFor(q => q)
            .Must(q =>
                !q.FromUtc.HasValue
                || !q.ToUtc.HasValue
                || (q.ToUtc.Value - q.FromUtc.Value) <= GetActivityAuditsQueryHandler.MaxWindow)
            .WithMessage($"Query window cannot exceed {GetActivityAuditsQueryHandler.MaxWindow.TotalDays:0} days.");

        RuleFor(q => q.SlowThresholdMs)
            .InclusiveBetween(1, 600_000)
            .When(q => q.SlowThresholdMs.HasValue);

        RuleFor(q => q.TenantId).MaximumLength(64);
    }
}
