using FluentValidation;
using FSH.Framework.Web.Validation;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.v1.Approvals;

namespace FSH.Modules.Identity.Features.v1.Approvals.SearchApprovals;

public sealed class SearchApprovalsQueryValidator : AbstractValidator<SearchApprovalsQuery>
{
    public SearchApprovalsQueryValidator()
    {
        Include(new PagedQueryValidator<SearchApprovalsQuery>());

        RuleFor(q => q.Action)
            .Must(ApprovalActions.IsKnown)
            .When(q => !string.IsNullOrWhiteSpace(q.Action))
            .WithMessage("Unknown action.");
        RuleFor(q => q.Search).MaximumLength(200);
        RuleFor(q => q.ToUtc)
            .GreaterThanOrEqualTo(q => q.FromUtc)
            .When(q => q.FromUtc is not null && q.ToUtc is not null)
            .WithMessage("'To' must be on or after 'From'.");
    }
}
