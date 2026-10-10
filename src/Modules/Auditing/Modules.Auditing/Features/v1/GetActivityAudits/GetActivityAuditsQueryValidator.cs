using FluentValidation;
using FSH.Framework.Web.Validation;
using FSH.Modules.Auditing.Contracts.v1.GetActivityAudits;

namespace FSH.Modules.Auditing.Features.v1.GetActivityAudits;

public sealed class GetActivityAuditsQueryValidator : AbstractValidator<GetActivityAuditsQuery>
{
    private static readonly string[] Methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

    public GetActivityAuditsQueryValidator()
    {
        Include(new PagedQueryValidator<GetActivityAuditsQuery>());

        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");

        RuleFor(q => q)
            .Must(q =>
                !q.FromUtc.HasValue
                || !q.ToUtc.HasValue
                || (q.ToUtc.Value - q.FromUtc.Value) <= GetActivityAuditsQueryHandler.MaxWindow)
            .WithMessage($"Query window cannot exceed {GetActivityAuditsQueryHandler.MaxWindow.TotalDays:0} days.");

        RuleFor(q => q.Method)
            .Must(m => string.IsNullOrWhiteSpace(m) || Methods.Contains(m.Trim(), StringComparer.OrdinalIgnoreCase))
            .WithMessage("Method must be one of: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.");

        RuleFor(q => q.StatusClass)
            .Must(s => string.IsNullOrWhiteSpace(s) || GetActivityAuditsQueryHandler.StatusClassRange(s) is not null)
            .WithMessage("StatusClass must be one of: 1xx, 2xx, 3xx, 4xx, 5xx, error.");

        RuleFor(q => q.StatusCode)
            .InclusiveBetween(100, 599)
            .When(q => q.StatusCode.HasValue);

        RuleFor(q => q.MinDurationMs)
            .InclusiveBetween(0, 600_000)
            .When(q => q.MinDurationMs.HasValue);

        RuleFor(q => q.PathContains).MaximumLength(256);
        RuleFor(q => q.Search).MaximumLength(256);
        RuleFor(q => q.TenantId).MaximumLength(64);
        RuleFor(q => q.CorrelationId).MaximumLength(128);
    }
}
