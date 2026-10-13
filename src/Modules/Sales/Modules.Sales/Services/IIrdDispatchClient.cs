namespace FSH.Modules.Sales.Services;

/// <summary>Outcome of one outbound dispatch attempt. <see cref="IsPermanentFailure"/> lets a caller
/// short-circuit the retry/backoff schedule for errors that will never resolve on their own (e.g. wrong
/// credentials) instead of spinning through attempts that can only ever fail. <see cref="ResponseCode"/> is what
/// CBMS answered: its result code ("200", "101", "100", …) or, when there was none, the HTTP status.</summary>
public sealed record IrdDispatchResult(
    bool Success, string? ExternalInvoiceId, string? ErrorMessage, bool IsPermanentFailure, string? ResponseCode = null);

/// <summary>One CBMS call: the full endpoint (<c>{base}/api/bill</c> or <c>{base}/api/billreturn</c>) and the JSON
/// body. The body carries the CBMS password, so it must never be logged.</summary>
public sealed record IrdDispatchRequest(Uri Endpoint, string Body, int TimeoutMs);

/// <summary>
/// Outbound call to Nepal's IRD CBMS for one queued bill or credit note. Production implementation:
/// <see cref="HttpIrdDispatchClient"/>. It never reports success unless CBMS accepted the document.
/// </summary>
public interface IIrdDispatchClient
{
    /// <param name="request">Endpoint and body, sent verbatim.</param>
    /// <param name="cancellationToken">Caller shutdown token. Cancellation is rethrown, not reported as a failure.</param>
    Task<IrdDispatchResult> SendAsync(IrdDispatchRequest request, CancellationToken cancellationToken);
}
