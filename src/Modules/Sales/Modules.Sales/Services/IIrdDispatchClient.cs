namespace FSH.Modules.Sales.Services;

/// <summary>Outcome of one outbound dispatch attempt. <see cref="IsPermanentFailure"/> lets a caller
/// short-circuit the retry/backoff schedule for errors that will never resolve on their own (e.g. "not
/// configured") instead of spinning through attempts that can only ever fail.</summary>
public sealed record IrdDispatchResult(bool Success, string? ExternalInvoiceId, string? ErrorMessage, bool IsPermanentFailure);

/// <summary>
/// Outbound call to Nepal's IRD e-invoice / CBMS middleware for one queued invoice.
///
/// Production implementation: <see cref="HttpIrdDispatchClient"/> (a real HTTP POST to the tenant's configured
/// endpoint, mirroring lib/api/ird-service.ts <c>sendInvoiceToIrd</c>). It never reports success unless the
/// remote side answered 2xx, and it reports a permanent failure when the tenant has no usable configuration.
/// </summary>
public interface IIrdDispatchClient
{
    /// <param name="tenantId">Tenant that owns the queued invoice; selects the IRD configuration.</param>
    /// <param name="payloadJson">Serialized invoice body, sent verbatim as the request body.</param>
    /// <param name="cancellationToken">Caller shutdown token. Cancellation is rethrown, not reported as a failure.</param>
    Task<IrdDispatchResult> SendInvoiceAsync(string tenantId, string payloadJson, CancellationToken cancellationToken);
}
