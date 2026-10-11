using Auditing.Tests.Features;
using FSH.Framework.Core.Context;
using FSH.Modules.Auditing;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.v1.Reports.GetEntityAuditLogs;
using FSH.Modules.Auditing.Features.v1.Reports.GetEntityAuditLogs;
using FSH.Modules.Auditing.Persistence;
using FSH.Modules.Identity.Contracts.Services;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Auditing.Tests.Features.Reports;

/// <summary>
/// TableName/Action filters use <c>EF.Functions.ILike</c> against the jsonb payload, which only
/// translates against the real Npgsql provider (see AuditDbContextFactory remarks + AuditPayloadFilterTests
/// in Integration.Tests). These handler tests exercise the InMemory-translatable paths: EntityChange
/// scoping, date-range filtering, pagination, and payload-to-DTO field extraction.
/// </summary>
public sealed class GetEntityAuditLogsQueryHandlerTests : IDisposable
{
    private readonly AuditTestContext _ctx = AuditDbContextFactory.Create();
    private readonly AuditDbContext _db;
    private readonly GetEntityAuditLogsQueryHandler _sut;

    public GetEntityAuditLogsQueryHandlerTests()
    {
        _db = _ctx.Db;
        _sut = new GetEntityAuditLogsQueryHandler(
            _db,
            Substitute.For<ICurrentUser>(),
            Substitute.For<IUserPermissionService>(),
            NullLogger<GetEntityAuditLogsQueryHandler>.Instance);
    }

    private async Task<Guid> SeedAsync(
        AuditEventType eventType, string? table, string? operation, DateTime occurredAtUtc, string? recordId = "Id:1")
    {
        var id = Guid.NewGuid();
        string payload = table is null
            ? "{}"
            : $$"""{"dbContext":"TestDb","schema":null,"table":"{{table}}","entityName":"{{table}}","key":"{{recordId}}","operation":"{{operation}}","changes":[],"transactionId":null}""";

        _db.AuditRecords.Add(new AuditRecord
        {
            Id = id,
            OccurredAtUtc = occurredAtUtc,
            ReceivedAtUtc = occurredAtUtc,
            EventType = (int)eventType,
            Severity = (byte)AuditSeverity.Information,
            UserId = "user-1",
            PayloadJson = payload
        });
        await _db.SaveChangesAsync(CancellationToken.None);
        return id;
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_OnlyReturnEntityChangeRecords_And_ExtractTableRecordAction()
    {
        // Arrange
        var now = DateTime.UtcNow;
        var entityChangeId = await SeedAsync(AuditEventType.EntityChange, "medicines", "Insert", now);
        await SeedAsync(AuditEventType.Security, null, null, now.AddMinutes(-1));

        // Act
        var result = await _sut.Handle(new GetEntityAuditLogsQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(1);
        var item = result.Items.ShouldHaveSingleItem();
        item.Id.ShouldBe(entityChangeId);
        item.TableName.ShouldBe("medicines");
        item.Action.ShouldBe("Insert");
        item.RecordId.ShouldBe("Id:1");
    }

    [Fact]
    public async Task Handle_Should_OrderByOccurredAtUtc_Descending()
    {
        // Arrange
        var now = DateTime.UtcNow;
        var older = await SeedAsync(AuditEventType.EntityChange, "medicines", "Insert", now.AddMinutes(-5));
        var newer = await SeedAsync(AuditEventType.EntityChange, "medicines", "Update", now);

        // Act
        var result = await _sut.Handle(new GetEntityAuditLogsQuery(), CancellationToken.None);

        // Assert
        result.Items.First().Id.ShouldBe(newer);
        result.Items.Last().Id.ShouldBe(older);
    }

    [Fact]
    public async Task Handle_Should_FilterByDateRange()
    {
        // Arrange
        var now = DateTime.UtcNow;
        await SeedAsync(AuditEventType.EntityChange, "medicines", "Insert", now.AddDays(-10));
        await SeedAsync(AuditEventType.EntityChange, "medicines", "Insert", now);

        // Act
        var result = await _sut.Handle(
            new GetEntityAuditLogsQuery { FromUtc = now.AddDays(-1), ToUtc = now.AddDays(1) },
            CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(1);
    }

    [Fact]
    public async Task Handle_Should_Paginate()
    {
        // Arrange
        var now = DateTime.UtcNow;
        for (int i = 0; i < 5; i++)
        {
            await SeedAsync(AuditEventType.EntityChange, "medicines", "Insert", now.AddMinutes(-i));
        }

        // Act
        var result = await _sut.Handle(
            new GetEntityAuditLogsQuery { PageNumber = 1, PageSize = 2 }, CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(5);
        result.Items.Count.ShouldBe(2);
        result.TotalPages.ShouldBe(3);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public async Task Handle_Should_ReturnEmptyPage_When_NoEntityChangeRecordsExist()
    {
        // Arrange
        await SeedAsync(AuditEventType.Activity, null, null, DateTime.UtcNow);

        // Act
        var result = await _sut.Handle(new GetEntityAuditLogsQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(0);
        result.Items.ShouldBeEmpty();
    }

    #endregion

    public void Dispose() => _ctx.Dispose();
}
