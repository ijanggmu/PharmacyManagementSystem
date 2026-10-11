using System.Text.Json;

namespace FSH.Modules.Auditing.Contracts.Dtos;

/// <summary>
/// Full view of one outbox integration event: dispatch state, the serialized event payload and the
/// inbox handlers that consumed it.
/// </summary>
public sealed class IntegrationEventDetailDto
{
    public Guid Id { get; set; }

    public DateTime CreatedOnUtc { get; set; }

    /// <summary>Assembly-qualified CLR type as stored in the outbox.</summary>
    public string Type { get; set; } = default!;

    /// <summary>Human-readable name, e.g. "SaleCompleted".</summary>
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

    public string Status { get; set; } = default!;

    /// <summary>Event payload as JSON (sensitive keys masked).</summary>
    public JsonElement Payload { get; set; }

    public IReadOnlyList<IntegrationEventConsumerDto> Consumers { get; set; } = [];
}

/// <summary>An inbox row: a handler that has processed the event.</summary>
public sealed class IntegrationEventConsumerDto
{
    public string HandlerName { get; set; } = default!;

    public string HandlerShortName { get; set; } = default!;

    public string? Module { get; set; }

    public DateTime ProcessedOnUtc { get; set; }
}
