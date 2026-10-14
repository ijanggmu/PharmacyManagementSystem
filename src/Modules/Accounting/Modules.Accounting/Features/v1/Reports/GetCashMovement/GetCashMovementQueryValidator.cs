using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashMovement;

public sealed class GetCashMovementQueryValidator : AbstractValidator<GetCashMovementQuery>
{
    public GetCashMovementQueryValidator()
    {
        RuleFor(x => x.FromUtc).NotEmpty();
        RuleFor(x => x.ToUtc).NotEmpty().GreaterThanOrEqualTo(x => x.FromUtc).WithMessage("The period must end on or after it starts.");
    }
}
