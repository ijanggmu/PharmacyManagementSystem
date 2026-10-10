using FSH.Modules.Auditing.Contracts.v1.Reports.GetEntityAuditLogs;
using FSH.Modules.Auditing.Features.v1.Reports.GetEntityAuditLogs;

namespace Auditing.Tests.Features.Reports;

public sealed class GetEntityAuditLogsQueryValidatorTests
{
    private readonly GetEntityAuditLogsQueryValidator _sut = new();

    [Fact]
    public void Validate_Should_Fail_When_FromUtc_After_ToUtc()
    {
        var now = DateTime.UtcNow;
        var result = _sut.Validate(new GetEntityAuditLogsQuery { FromUtc = now, ToUtc = now.AddDays(-1) });

        result.IsValid.ShouldBeFalse();
    }

    [Fact]
    public void Validate_Should_Pass_When_NoDateRangeSupplied()
    {
        var result = _sut.Validate(new GetEntityAuditLogsQuery());

        result.IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Validate_Should_Pass_When_TableIsPartialName()
    {
        var result = _sut.Validate(new GetEntityAuditLogsQuery { TableName = "sale", Action = "Update" });

        result.IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Validate_Should_Fail_When_TableNameTooLong()
    {
        var result = _sut.Validate(new GetEntityAuditLogsQuery { TableName = new string('t', 129) });

        result.IsValid.ShouldBeFalse();
    }
}
