using FSH.Modules.Auditing.Contracts.v1.Reports.GetAuditTrailComplianceReport;
using FSH.Modules.Auditing.Features.v1.Reports.GetAuditTrailComplianceReport;

namespace Auditing.Tests.Features.Reports;

public sealed class GetAuditTrailComplianceReportQueryValidatorTests
{
    private readonly GetAuditTrailComplianceReportQueryValidator _sut = new();

    [Fact]
    public void Validate_Should_Fail_When_FromUtc_After_ToUtc()
    {
        var now = DateTime.UtcNow;
        var result = _sut.Validate(new GetAuditTrailComplianceReportQuery(now, now.AddDays(-1)));

        result.IsValid.ShouldBeFalse();
    }

    [Fact]
    public void Validate_Should_Pass_When_NoDateRangeSupplied()
    {
        var result = _sut.Validate(new GetAuditTrailComplianceReportQuery(null, null));

        result.IsValid.ShouldBeTrue();
    }
}
