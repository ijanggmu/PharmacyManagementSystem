namespace FSH.Modules.Auditing.Contracts;

/// <summary>
/// Activity (HTTP request / job / command) audit payload.
/// </summary>
/// <remarks>
/// The trailing HTTP request fields (<see cref="Method"/> … <see cref="UserAgent"/>) were added
/// later and are optional with <c>null</c> defaults so payloads persisted before they existed still
/// deserialize — they simply come back as <c>null</c>.
/// </remarks>
public sealed record ActivityEventPayload(
    ActivityKind Kind,
    string Name,                 // request path, command/query name, job id
    int? StatusCode,
    int DurationMs,
    BodyCapture Captured,        // Request/Response/Both/None
    int RequestSize,
    int ResponseSize,
    object? RequestPreview,      // truncated/filtered snapshot (JSON-friendly)
    object? ResponsePreview,
    string? Method = null,       // HTTP verb (GET/POST/…)
    string? QueryString = null,  // masked query string, including the leading '?'
    string? RouteTemplate = null,// matched endpoint route pattern, e.g. api/v1/sales/{id:guid}
    string? ClientIp = null,     // caller IP (after forwarded-headers processing)
    string? UserAgent = null,    // truncated User-Agent header
    string? ErrorType = null     // exception type name when the request failed with an unhandled exception
);
