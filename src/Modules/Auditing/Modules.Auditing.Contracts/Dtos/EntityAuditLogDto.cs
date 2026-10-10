namespace FSH.Modules.Auditing.Contracts.Dtos;

/// <summary>
/// One row of the tenant-scoped, paginated entity audit-log listing — .NET port of the Next.js
/// reference's <c>listAuditLogs</c> (lib/server/services/reports-service.ts, used by
/// <c>/api/reports/audit-logs</c>). See
/// <see cref="FSH.Modules.Auditing.Contracts.v1.Reports.GetEntityAuditLogs.GetEntityAuditLogsQuery"/>
/// for the fields intentionally not carried over (IpAddress/UserAgent — not captured anywhere in the
/// ported <c>AuditRecord</c>/<c>EntityChangeEventPayload</c> model).
/// </summary>
public sealed record EntityAuditLogDto(
    Guid Id,
    string? UserId,
    string? TableName,
    string? RecordId,
    string? Action,
    DateTime OccurredAtUtc,
    string? TenantId);
