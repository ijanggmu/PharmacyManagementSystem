using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Auditing.Contracts.v1.GetActivityAudits;

/// <summary>
/// Paged HTTP request log ("system log") over Activity audit records.
/// Defaults to the last 24 hours; windows wider than 90 days are rejected.
/// </summary>
public sealed class GetActivityAuditsQuery : IPagedQuery, IQuery<PagedResponse<ActivityAuditSummaryDto>>
{
    public int? PageNumber { get; set; }

    public int? PageSize { get; set; }

    public string? Sort { get; set; }

    public DateTime? FromUtc { get; set; }

    public DateTime? ToUtc { get; set; }

    /// <summary>Own tenant when empty; another tenant id or <c>*</c> (all) needs ViewCrossTenant.</summary>
    public string? TenantId { get; set; }

    /// <summary>HTTP verb, e.g. GET, POST.</summary>
    public string? Method { get; set; }

    /// <summary>Status class: 1xx, 2xx, 3xx, 4xx, 5xx, or "error" (4xx + 5xx).</summary>
    public string? StatusClass { get; set; }

    public int? StatusCode { get; set; }

    public string? PathContains { get; set; }

    public string? UserId { get; set; }

    /// <summary>Free text over path, user name and source.</summary>
    public string? Search { get; set; }

    public int? MinDurationMs { get; set; }

    public string? CorrelationId { get; set; }
}

/// <summary>Request volume / error-rate / latency KPIs over a window (default 24h).</summary>
public sealed class GetActivityStatsQuery : IQuery<ActivityStatsDto>
{
    public DateTime? FromUtc { get; init; }

    public DateTime? ToUtc { get; init; }

    public string? TenantId { get; init; }

    /// <summary>Threshold for "slow" requests; defaults to 1000 ms.</summary>
    public int? SlowThresholdMs { get; init; }
}
