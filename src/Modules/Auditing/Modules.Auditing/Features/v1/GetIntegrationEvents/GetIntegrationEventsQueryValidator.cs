using FluentValidation;
using FSH.Framework.Web.Validation;
using FSH.Modules.Auditing.Contracts.v1.GetIntegrationEvents;

namespace FSH.Modules.Auditing.Features.v1.GetIntegrationEvents;

public sealed class GetIntegrationEventsQueryValidator : AbstractValidator<GetIntegrationEventsQuery>
{
    public GetIntegrationEventsQueryValidator()
    {
        Include(new PagedQueryValidator<GetIntegrationEventsQuery>());

        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");

        RuleFor(q => q)
            .Must(q =>
                !q.FromUtc.HasValue
                || !q.ToUtc.HasValue
                || (q.ToUtc.Value - q.FromUtc.Value) <= GetIntegrationEventsQueryHandler.MaxWindow)
            .WithMessage($"Query window cannot exceed {GetIntegrationEventsQueryHandler.MaxWindow.TotalDays:0} days.");

        RuleFor(q => q.Status)
            .Must(s => string.IsNullOrWhiteSpace(s) || new[] { "Pending", "Processed", "Failed", "Dead" }
                .Contains(s, StringComparer.OrdinalIgnoreCase))
            .WithMessage("Status must be one of: Pending, Processed, Failed, Dead.");
    }
}
