namespace FSH.Modules.Auditing.Contracts.Dtos;

/// <summary>
/// Security audit row for the admin "System Access Log" view (sign-ins, token issuance,
/// impersonation). Adds the <see cref="SecurityEventPayload"/> fields the list needs
/// (action, reason, IP) on top of <see cref="AuditSummaryDto"/>, parsed server-side from the
/// jsonb payload so the client never has to.
/// </summary>
public sealed class SecurityAuditSummaryDto
{
    public Guid Id { get; set; }

    public DateTime OccurredAtUtc { get; set; }

    public AuditEventType EventType { get; set; }

    public AuditSeverity Severity { get; set; }

    public string? TenantId { get; set; }

    public string? UserId { get; set; }

    public string? UserName { get; set; }

    public string? TraceId { get; set; }

    public string? CorrelationId { get; set; }

    public string? RequestId { get; set; }

    public string? Source { get; set; }

    public AuditTag Tags { get; set; }

    /// <summary>The <see cref="SecurityAction"/> name, e.g. "LoginSucceeded", "LoginFailed".</summary>
    public string? Action { get; set; }

    /// <summary>Failure/outcome reason code, e.g. "InvalidPassword", "LockedOut". Empty on success.</summary>
    public string? ReasonCode { get; set; }

    /// <summary>Authentication method, e.g. "Password", "Impersonation".</summary>
    public string? AuthMethod { get; set; }

    /// <summary>Client/caller IP address, when captured.</summary>
    public string? Ip { get; set; }

    /// <summary>User agent string, when captured.</summary>
    public string? UserAgent { get; set; }
}
