using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Loyalty;

namespace FSH.Modules.Customers.Features.v1.Loyalty.AdjustLoyaltyPoints;

public sealed class AdjustLoyaltyPointsCommandValidator : AbstractValidator<AdjustLoyaltyPointsCommand>
{
    public AdjustLoyaltyPointsCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Points).NotEqual(0).WithMessage("Enter how many points to add or remove.")
            .InclusiveBetween(-1_000_000, 1_000_000);
        RuleFor(x => x.Reason).NotEmpty().WithMessage("Say why the points are being adjusted.").MaximumLength(256);
    }
}
