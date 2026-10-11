using FluentValidation;
using FSH.Framework.Web.Validation;
using FSH.Modules.Auditing.Contracts.v1.SearchSecurityAudits;

namespace FSH.Modules.Auditing.Features.v1.SearchSecurityAudits;

public sealed class SearchSecurityAuditsQueryValidator : AbstractValidator<SearchSecurityAuditsQuery>
{
    public SearchSecurityAuditsQueryValidator()
    {
        Include(new PagedQueryValidator<SearchSecurityAuditsQuery>());

        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");

        RuleFor(q => q)
            .Must(q =>
                !q.FromUtc.HasValue
                || !q.ToUtc.HasValue
                || (q.ToUtc.Value - q.FromUtc.Value) <= SearchSecurityAuditsQueryHandler.MaxWindow)
            .WithMessage($"Query window cannot exceed {SearchSecurityAuditsQueryHandler.MaxWindow.TotalDays:0} days.");

        RuleFor(q => q.Action).IsInEnum().When(q => q.Action.HasValue);
        RuleFor(q => q.Severity).IsInEnum().When(q => q.Severity.HasValue);
        RuleFor(q => q.Search).MaximumLength(256);
        RuleFor(q => q.TenantId).MaximumLength(64);
    }
}
