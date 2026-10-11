using FSH.Modules.Auditing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Auditing.Contracts.v1.Reports.GetAuditTrailComplianceReport;

/// <summary>
/// Audit trail compliance report — .NET port of the "audit" branch of the Next.js reference's
/// <c>generateAuditTrailComplianceReport</c> (lib/server/services/reports-service.ts, used by
/// <c>/api/reports/compliance?type=audit</c>).
///
/// The Next.js source read a trigger-populated <c>audit_logs</c> table that only ever contained
/// row-level INSERT/UPDATE/DELETE events. The closest equivalent in this module's generic
/// <c>AuditRecord</c> table is the subset with <c>EventType == EntityChange</c> — the handler scopes
/// to that subset so "byAction" lines up with the source's INSERT/UPDATE/DELETE grouping. The source's
/// <c>phiAccessCount</c> was already hardcoded to 0 upstream ("PHI tracking removed") and is kept as a
/// constant 0 here rather than invented.
/// </summary>
public sealed record GetAuditTrailComplianceReportQuery(DateTime? FromUtc, DateTime? ToUtc)
    : IQuery<AuditTrailComplianceReportDto>;
