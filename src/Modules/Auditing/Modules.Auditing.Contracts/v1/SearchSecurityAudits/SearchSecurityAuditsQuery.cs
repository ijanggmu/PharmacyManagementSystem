using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Auditing.Contracts.v1.SearchSecurityAudits;

/// <summary>
/// Paged, tenant-scoped security audit search (sign-ins, tokens, roles, permission denials,
/// impersonation). Paged successor of <c>GET /audits/security</c>, which stays for compatibility.
/// </summary>
public sealed class SearchSecurityAuditsQuery : IPagedQuery, IQuery<PagedResponse<SecurityAuditSummaryDto>>
{
    public int? PageNumber { get; set; }

    public int? PageSize { get; set; }

    public string? Sort { get; set; }

    public DateTime? FromUtc { get; set; }

    public DateTime? ToUtc { get; set; }

    /// <summary>Own tenant when empty; another tenant id or <c>*</c> (all) needs ViewCrossTenant.</summary>
    public string? TenantId { get; set; }

    public SecurityAction? Action { get; set; }

    public AuditSeverity? Severity { get; set; }

    public string? UserId { get; set; }

    /// <summary>Free text over user name, reason code and IP.</summary>
    public string? Search { get; set; }
}

/// <summary>
/// Paged, tenant-scoped exception audit search. Paged successor of <c>GET /audits/exceptions</c>.
/// </summary>
public sealed class SearchExceptionAuditsQuery : IPagedQuery, IQuery<PagedResponse<ExceptionAuditSummaryDto>>
{
    public int? PageNumber { get; set; }

    public int? PageSize { get; set; }

    public string? Sort { get; set; }

    public DateTime? FromUtc { get; set; }

    public DateTime? ToUtc { get; set; }

    public string? TenantId { get; set; }

    public AuditSeverity? Severity { get; set; }

    public ExceptionArea? Area { get; set; }

    public string? ExceptionType { get; set; }

    /// <summary>Free text over message, exception type, route and user name.</summary>
    public string? Search { get; set; }
}
