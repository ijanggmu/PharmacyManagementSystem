using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;

public sealed class GetVatReturnQueryValidator : AbstractValidator<GetVatReturnQuery>
{
    public GetVatReturnQueryValidator()
    {
        RuleFor(x => x.FromUtc).NotEmpty();
        RuleFor(x => x.ToUtc).NotEmpty().GreaterThanOrEqualTo(x => x.FromUtc).WithMessage("The period must end on or after it starts.");
    }
}
