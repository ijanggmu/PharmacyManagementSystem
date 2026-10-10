using FluentValidation;
using FSH.Modules.Auditing.Contracts.v1.Reports.GetAuditTrailComplianceReport;

namespace FSH.Modules.Auditing.Features.v1.Reports.GetAuditTrailComplianceReport;

public sealed class GetAuditTrailComplianceReportQueryValidator : AbstractValidator<GetAuditTrailComplianceReportQuery>
{
    public GetAuditTrailComplianceReportQueryValidator()
    {
        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("FromUtc must be less than or equal to ToUtc.");
    }
}
