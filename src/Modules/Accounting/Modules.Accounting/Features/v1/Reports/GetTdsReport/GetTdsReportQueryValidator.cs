using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Reports;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetTdsReport;

public sealed class GetTdsReportQueryValidator : AbstractValidator<GetTdsReportQuery>
{
    public GetTdsReportQueryValidator()
    {
        RuleFor(x => x.FromUtc).NotEmpty();
        RuleFor(x => x.ToUtc).NotEmpty().GreaterThanOrEqualTo(x => x.FromUtc).WithMessage("The period must end on or after it starts.");
        RuleFor(x => x.BranchId).NotEqual(Guid.Empty).When(x => x.BranchId is not null);
    }
}
