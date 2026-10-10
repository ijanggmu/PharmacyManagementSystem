namespace FSH.Modules.Auditing.Contracts.Dtos;

/// <summary>
/// One entity-change audit record surfaced by the audit-trail compliance report — see
/// <see cref="FSH.Modules.Auditing.Contracts.v1.Reports.GetAuditTrailComplianceReport.GetAuditTrailComplianceReportQuery"/>.
/// </summary>
public sealed record AuditTrailComplianceReportEntryDto(
    Guid Id,
    DateTime OccurredAtUtc,
    string? UserId,
    string? UserName,
    string? Table,
    string? RecordKey,
    string? Action,
    string? TenantId);

/// <summary>
/// .NET port of the Next.js reference's <c>generateAuditTrailComplianceReport</c>
/// (lib/server/services/reports-service.ts, the "audit" branch of <c>/api/reports/compliance</c>).
/// </summary>
public sealed record AuditTrailComplianceReportDto(
    DateTime? FromUtc,
    DateTime? ToUtc,
    int TotalLogs,
    IReadOnlyDictionary<string, int> ByAction,
    int PhiAccessCount,
    IReadOnlyList<AuditTrailComplianceReportEntryDto> Logs);
