using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.ChangeExpiryClaimStatus;

public sealed class ChangeExpiryClaimStatusCommandValidator : AbstractValidator<ChangeExpiryClaimStatusCommand>
{
    public ChangeExpiryClaimStatusCommandValidator()
    {
        RuleFor(x => x.ClaimId).NotEmpty();
        RuleFor(x => x.Action).IsInEnum();
        RuleFor(x => x.Reason).NotEmpty().When(x => x.Action == ExpiryClaimAction.Reject)
            .WithMessage("Say why the supplier rejected the claim.");
        RuleFor(x => x.Reason).MaximumLength(512);
        RuleFor(x => x.Reference).MaximumLength(100);
    }
}
