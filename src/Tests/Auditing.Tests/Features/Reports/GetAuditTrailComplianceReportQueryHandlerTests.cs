using Auditing.Tests.Features;
using FSH.Modules.Auditing;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.v1.Reports.GetAuditTrailComplianceReport;
using FSH.Modules.Auditing.Features.v1.Reports.GetAuditTrailComplianceReport;
using FSH.Modules.Auditing.Persistence;
using Microsoft.Extensions.Logging.Abstractions;

namespace Auditing.Tests.Features.Reports;

public sealed class GetAuditTrailComplianceReportQueryHandlerTests : IDisposable
{
    private readonly AuditTestContext _ctx = AuditDbContextFactory.Create();
    private readonly AuditDbContext _db;
    private readonly GetAuditTrailComplianceReportQueryHandler _sut;

    public GetAuditTrailComplianceReportQueryHandlerTests()
    {
        _db = _ctx.Db;
        _sut = new GetAuditTrailComplianceReportQueryHandler(
            _db, NullLogger<GetAuditTrailComplianceReportQueryHandler>.Instance);
    }

    private async Task SeedAsync(
        AuditEventType eventType, EntityOperation? operation, string? table, DateTime occurredAtUtc)
    {
        string payload = operation is null
            ? "{}"
            : $$"""{"dbContext":"TestDb","schema":null,"table":"{{table}}","entityName":"{{table}}","key":"Id:1","operation":"{{operation}}","changes":[],"transactionId":null}""";

        _db.AuditRecords.Add(new AuditRecord
        {
            Id = Guid.NewGuid(),
            OccurredAtUtc = occurredAtUtc,
            ReceivedAtUtc = occurredAtUtc,
            EventType = (int)eventType,
            Severity = (byte)AuditSeverity.Information,
            UserId = "user-1",
            PayloadJson = payload
        });
        await _db.SaveChangesAsync(CancellationToken.None);
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_GroupEntityChangeRecords_ByOperation()
    {
        // Arrange
        var now = DateTime.UtcNow;
        await SeedAsync(AuditEventType.EntityChange, EntityOperation.Insert, "medicines", now);
        await SeedAsync(AuditEventType.EntityChange, EntityOperation.Insert, "medicines", now.AddMinutes(-1));
        await SeedAsync(AuditEventType.EntityChange, EntityOperation.Update, "sales", now.AddMinutes(-2));
        // Non-EntityChange events must be excluded from the report entirely.
        await SeedAsync(AuditEventType.Security, null, null, now.AddMinutes(-3));

        // Act
        var result = await _sut.Handle(new GetAuditTrailComplianceReportQuery(null, null), CancellationToken.None);

        // Assert
        result.TotalLogs.ShouldBe(3);
        result.ByAction["Insert"].ShouldBe(2);
        result.ByAction["Update"].ShouldBe(1);
        result.Logs.Count.ShouldBe(3);
        result.PhiAccessCount.ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_FilterByDateRange()
    {
        // Arrange
        var now = DateTime.UtcNow;
        await SeedAsync(AuditEventType.EntityChange, EntityOperation.Insert, "medicines", now.AddDays(-10));
        await SeedAsync(AuditEventType.EntityChange, EntityOperation.Insert, "medicines", now);

        // Act
        var result = await _sut.Handle(
            new GetAuditTrailComplianceReportQuery(now.AddDays(-1), now.AddDays(1)), CancellationToken.None);

        // Assert
        result.TotalLogs.ShouldBe(1);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public async Task Handle_Should_ReturnEmptyReport_When_NoEntityChangeRecordsExist()
    {
        // Arrange
        await SeedAsync(AuditEventType.Activity, null, null, DateTime.UtcNow);

        // Act
        var result = await _sut.Handle(new GetAuditTrailComplianceReportQuery(null, null), CancellationToken.None);

        // Assert
        result.TotalLogs.ShouldBe(0);
        result.ByAction.ShouldBeEmpty();
        result.Logs.ShouldBeEmpty();
    }

    #endregion

    public void Dispose() => _ctx.Dispose();
}
