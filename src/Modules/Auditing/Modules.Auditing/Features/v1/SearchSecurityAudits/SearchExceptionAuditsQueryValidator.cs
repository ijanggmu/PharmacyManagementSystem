using FluentValidation;
using FSH.Framework.Web.Validation;
using FSH.Modules.Auditing.Contracts.v1.SearchSecurityAudits;

namespace FSH.Modules.Auditing.Features.v1.SearchSecurityAudits;

public sealed class SearchExceptionAuditsQueryValidator : AbstractValidator<SearchExceptionAuditsQuery>
{
    public SearchExceptionAuditsQueryValidator()
    {
        Include(new PagedQueryValidator<SearchExceptionAuditsQuery>());

        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");

        RuleFor(q => q)
            .Must(q =>
                !q.FromUtc.HasValue
                || !q.ToUtc.HasValue
                || (q.ToUtc.Value - q.FromUtc.Value) <= SearchSecurityAuditsQueryHandler.MaxWindow)
            .WithMessage($"Query window cannot exceed {SearchSecurityAuditsQueryHandler.MaxWindow.TotalDays:0} days.");

        RuleFor(q => q.Severity).IsInEnum().When(q => q.Severity.HasValue);
        RuleFor(q => q.Area).IsInEnum().When(q => q.Area.HasValue);
        RuleFor(q => q.ExceptionType).MaximumLength(256);
        RuleFor(q => q.Search).MaximumLength(256);
        RuleFor(q => q.TenantId).MaximumLength(64);
    }
}
