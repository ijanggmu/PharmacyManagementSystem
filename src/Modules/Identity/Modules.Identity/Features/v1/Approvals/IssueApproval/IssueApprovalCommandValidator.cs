using FluentValidation;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.v1.Approvals;

namespace FSH.Modules.Identity.Features.v1.Approvals.IssueApproval;

public sealed class IssueApprovalCommandValidator : AbstractValidator<IssueApprovalCommand>
{
    public IssueApprovalCommandValidator()
    {
        RuleFor(x => x.ApproverLogin).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Action)
            .NotEmpty()
            .Must(ApprovalActions.IsKnown)
            .WithMessage("Unknown action. Expected one of: " + string.Join(", ", ApprovalActions.All) + ".");
        RuleFor(x => x.Amount).GreaterThanOrEqualTo(0m).LessThan(1_000_000_000m);
        RuleFor(x => x.TargetRef).MaximumLength(128);
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}
