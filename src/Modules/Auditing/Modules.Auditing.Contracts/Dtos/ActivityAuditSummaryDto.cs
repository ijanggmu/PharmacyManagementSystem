namespace FSH.Modules.Auditing.Contracts.Dtos;

/// <summary>
/// One HTTP request row for the "API requests" system log, projected from an Activity audit record's
/// jsonb payload. Fields that older payloads never captured (method, route, IP…) come back <c>null</c>.
/// </summary>
public sealed class ActivityAuditSummaryDto
{
    public Guid Id { get; set; }

    public DateTime OccurredAtUtc { get; set; }

    public AuditSeverity Severity { get; set; }

    public string? TenantId { get; set; }

    public string? UserId { get; set; }

    public string? UserName { get; set; }

    public string? Method { get; set; }

    /// <summary>Request path (no query string).</summary>
    public string? Path { get; set; }

    public string? QueryString { get; set; }

    public string? RouteTemplate { get; set; }

    public int? StatusCode { get; set; }

    public int? DurationMs { get; set; }

    public string? Source { get; set; }

    public string? ClientIp { get; set; }

    /// <summary>Exception type when the request failed with an unhandled exception.</summary>
    public string? ErrorType { get; set; }

    public string? CorrelationId { get; set; }

    public string? TraceId { get; set; }
}

/// <summary>KPI strip for the system log: request volume, error rate and latency over a window.</summary>
public sealed class ActivityStatsDto
{
    public DateTime FromUtc { get; set; }

    public DateTime ToUtc { get; set; }

    public long TotalRequests { get; set; }

    public long ClientErrors { get; set; }

    public long ServerErrors { get; set; }

    /// <summary>Requests at or above <see cref="SlowThresholdMs"/>.</summary>
    public long SlowRequests { get; set; }

    public int SlowThresholdMs { get; set; }

    public double? AvgDurationMs { get; set; }

    public int? P95DurationMs { get; set; }

    /// <summary>(4xx + 5xx) / total, 0..1. Zero when there were no requests.</summary>
    public double ErrorRate { get; set; }
}

/// <summary>Exception audit row with the payload fields the Errors list needs.</summary>
public sealed class ExceptionAuditSummaryDto
{
    public Guid Id { get; set; }

    public DateTime OccurredAtUtc { get; set; }

    public AuditSeverity Severity { get; set; }

    public string? TenantId { get; set; }

    public string? UserId { get; set; }

    public string? UserName { get; set; }

    public string? TraceId { get; set; }

    public string? CorrelationId { get; set; }

    public string? RequestId { get; set; }

    public string? Source { get; set; }

    public string? Area { get; set; }

    public string? ExceptionType { get; set; }

    public string? Message { get; set; }

    public string? RouteOrLocation { get; set; }
}
