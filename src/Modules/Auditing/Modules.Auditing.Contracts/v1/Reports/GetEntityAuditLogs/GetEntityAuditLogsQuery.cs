using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Auditing.Contracts.v1.Reports.GetEntityAuditLogs;

/// <summary>
/// Tenant-scoped, paginated entity-change audit-log listing — .NET port of the Next.js reference's
/// <c>listAuditLogs</c> (lib/server/services/reports-service.ts, used by <c>/api/reports/audit-logs</c>).
///
/// Distinct from the module's generic <see cref="Modules.Auditing.Contracts.v1.GetAudits.GetAuditsQuery"/>:
/// that query filters/projects the generic audit envelope (EventType/Severity/Tags/Source/Correlation/Trace/
/// free-text Search) across every audit event kind. This query is scoped to <c>EventType == EntityChange</c>
/// only and exposes the domain-specific table/record/action shape the source's <c>audit_logs</c> table had
/// (<c>TableName</c>, <c>Action</c> == INSERT/UPDATE/DELETE/etc., <c>RecordId</c>), matching what
/// <c>/dashboard</c> callers of the original endpoint expect.
///
/// <c>IpAddress</c>/<c>UserAgent</c> from the source row shape are intentionally NOT carried over: neither
/// <c>AuditRecord</c> nor <see cref="Modules.Auditing.Contracts.EntityChangeEventPayload"/> captures the
/// client IP or user agent for entity-change events anywhere in this module — inventing a persisted field
/// for them is out of scope here.
/// </summary>
public sealed class GetEntityAuditLogsQuery : IPagedQuery, IQuery<PagedResponse<EntityAuditLogDto>>
{
    public int? PageNumber { get; set; }

    public int? PageSize { get; set; }

    public string? Sort { get; set; }

    /// <summary>
    /// Table filter (e.g. "medicines" or "sale"): case-insensitive substring match on the physical table name
    /// or the entity name.
    /// </summary>
    public string? TableName { get; set; }

    /// <summary>CRUD action to filter on. Matches the source's <c>action</c> filter (INSERT/UPDATE/DELETE).</summary>
    public string? Action { get; set; }

    public DateTime? FromUtc { get; set; }

    public DateTime? ToUtc { get; set; }

    /// <summary>
    /// Another tenant's id (root support desk). Omitted or equal to the caller's own tenant = the usual
    /// tenant-scoped listing. A different tenant requires Permissions.AuditTrails.ViewCrossTenant, the same
    /// gate as GetAuditsQuery.TenantId. There is no "all tenants" wildcard here.
    /// </summary>
    public string? TenantId { get; set; }
}
