namespace FSH.Modules.Auditing.Contracts.Dtos;

/// <summary>
/// Read-only projection of a transactional outbox row (see <c>FSH.Framework.Eventing.Outbox.OutboxMessage</c>)
/// for the admin "Integration Log" view. Surfaces cross-module integration-event dispatch status
/// (pending/processed/failed/dead) without exposing the raw payload by default.
/// </summary>
public sealed class IntegrationEventLogDto
{
    public Guid Id { get; set; }

    public DateTime CreatedOnUtc { get; set; }

    /// <summary>Assembly-qualified CLR type as stored in the outbox (kept for compatibility / exact filtering).</summary>
    public string Type { get; set; } = default!;

    /// <summary>Human-readable event name with namespace, assembly and "IntegrationEvent" suffix removed, e.g. "SaleCompleted".</summary>
    public string ShortType { get; set; } = default!;

    /// <summary>Publishing module derived from the event namespace, e.g. "Sales".</summary>
    public string? Module { get; set; }

    public string? TenantId { get; set; }

    public string? CorrelationId { get; set; }

    public DateTime? ProcessedOnUtc { get; set; }

    public int RetryCount { get; set; }

    public string? LastError { get; set; }

    public bool IsDead { get; set; }

    public DateTime? NextRetryAt { get; set; }

    public DateTime? ClaimedUntilUtc { get; set; }

    public string? ClaimedBy { get; set; }

    /// <summary>Derived status for display/filtering: Processed, Dead, Failed (has an error, awaiting retry), or Pending.</summary>
    public string Status { get; set; } = default!;
}
