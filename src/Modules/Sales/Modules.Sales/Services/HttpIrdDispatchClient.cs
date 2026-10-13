using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Sales.Services;

/// <summary>
/// Real <see cref="IIrdDispatchClient"/>: POSTs a bill / bill-return body to IRD's CBMS.
///
/// <para><b>Request:</b> <c>POST {endpoint}</c>, <c>Content-Type: application/json</c>, body verbatim. CBMS
/// authenticates with the <c>username</c>/<c>password</c> fields inside the body (no auth header). The body is never
/// logged — it holds the password.</para>
///
/// <para><b>Response classification</b> (drives <c>ProcessIrdInvoiceQueueJob</c>'s backoff). CBMS answers HTTP 200 with
/// a numeric result code in the body:</para>
/// <list type="bullet">
/// <item><c>200</c>: accepted. <c>101</c> (bill already exists): treated as accepted — a retried POST of a bill CBMS
/// already has (e.g. the resilience handler re-sent after a lost response).</item>
/// <item><c>100</c> (credentials don't match) and <c>104</c> (model invalid): permanent — retrying cannot fix them.</item>
/// <item><c>102</c> (error saving), <c>103</c> (unknown error), <c>105</c> (referenced bill not found yet): transient.</item>
/// <item>A 2xx body that is not a code: accepted (an <c>invoiceId</c>/<c>id</c> is kept as the external id).</item>
/// <item>HTTP 408, 429, 5xx, transport errors and timeouts: transient. Other HTTP 4xx: permanent.</item>
/// </list>
///
/// <para>The HTTP client is resolved from <see cref="HttpClientName"/>, which Sales registers with
/// <c>AddHeroResilience</c> (retry / circuit breaker / per-attempt timeout). A re-sent bill is answered 101, so the
/// retry is safe for bills.</para>
/// </summary>
public sealed partial class HttpIrdDispatchClient(
    IHttpClientFactory httpClientFactory,
    ILogger<HttpIrdDispatchClient> logger) : IIrdDispatchClient
{
    /// <summary>Named <see cref="HttpClient"/> registered by <c>SalesModule</c>.</summary>
    public const string HttpClientName = "IrdCbms";

    /// <summary>Default overall deadline per dispatch (15s).</summary>
    public const int DefaultTimeoutMs = 15_000;

    private const int MaxErrorMessageLength = 500;

    public async Task<IrdDispatchResult> SendAsync(IrdDispatchRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Body);
        cancellationToken.ThrowIfCancellationRequested();

        int timeoutMs = request.TimeoutMs > 0 ? request.TimeoutMs : DefaultTimeoutMs;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromMilliseconds(timeoutMs));

        try
        {
            using var message = new HttpRequestMessage(HttpMethod.Post, request.Endpoint)
            {
                Content = new StringContent(request.Body, Encoding.UTF8, "application/json"),
            };
            using var client = httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.SendAsync(message, deadline.Token).ConfigureAwait(false);
            string body = await response.Content.ReadAsStringAsync(deadline.Token).ConfigureAwait(false);

            return Classify(response.StatusCode, body);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The caller (job host) is shutting down: propagate rather than recording a failed attempt.
            throw;
        }
        catch (OperationCanceledException) when (deadline.IsCancellationRequested)
        {
            return Transient($"IRD CBMS did not respond within {timeoutMs} ms.", null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // HttpRequestException, resilience TimeoutRejected/BrokenCircuit, etc. All transient.
            LogTransportError(logger, ex, request.Endpoint.Host);
            return Transient($"IRD CBMS request failed: {ex.Message}", null);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "IRD CBMS transport error calling {Host}")]
    private static partial void LogTransportError(ILogger logger, Exception exception, string host);

    internal static IrdDispatchResult Classify(HttpStatusCode status, string body)
    {
        int http = (int)status;
        string httpCode = http.ToString(CultureInfo.InvariantCulture);

        if (http is >= 200 and < 300)
        {
            if (TryReadCbmsCode(body) is { } code)
            {
                return ClassifyCbmsCode(code);
            }

            return new IrdDispatchResult(true, TryReadExternalId(body), null, IsPermanentFailure: false, httpCode);
        }

        string message = ExtractErrorMessage(body) is { Length: > 0 } detail
            ? $"IRD CBMS responded with status {http}: {detail}"
            : $"IRD CBMS responded with status {http}";

        bool transient = http is 408 or 429 || http >= 500;
        return transient ? Transient(message, httpCode) : Permanent(message, httpCode);
    }

    internal static IrdDispatchResult ClassifyCbmsCode(int code)
    {
        string text = code.ToString(CultureInfo.InvariantCulture);
        return code switch
        {
            200 => new IrdDispatchResult(true, null, null, IsPermanentFailure: false, text),
            101 => new IrdDispatchResult(true, null, null, IsPermanentFailure: false, text),
            100 => Permanent("IRD CBMS rejected the API credentials (100). Check the CBMS username, password and seller PAN in IRD settings.", text),
            104 => Permanent("IRD CBMS rejected the document as invalid (104). Check the bill's PAN, dates and amounts.", text),
            102 => Transient("IRD CBMS failed while saving the document (102).", text),
            103 => Transient("IRD CBMS reported an unknown error (103).", text),
            105 => Transient("IRD CBMS does not have the referenced bill yet (105).", text),
            _ => Permanent($"IRD CBMS answered with unexpected code {text}.", text),
        };
    }

    /// <summary>CBMS's body is a bare number (<c>200</c>) — sometimes quoted.</summary>
    private static int? TryReadCbmsCode(string body)
    {
        string trimmed = body.Trim().Trim('"');
        return trimmed.Length is > 0 and <= 4 && int.TryParse(trimmed, NumberStyles.None, CultureInfo.InvariantCulture, out int code)
            ? code
            : null;
    }

    private static string? TryReadExternalId(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            foreach (var name in new[] { "invoiceId", "id" })
            {
                if (doc.RootElement.TryGetProperty(name, out var value)
                    && value.ValueKind is JsonValueKind.String or JsonValueKind.Number
                    && value.ToString() is { Length: > 0 } id)
                {
                    return id;
                }
            }

            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? ExtractErrorMessage(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        string? detail = null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var name in new[] { "error", "message" })
                {
                    if (doc.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
                    {
                        detail = value.GetString();
                        if (!string.IsNullOrWhiteSpace(detail))
                        {
                            break;
                        }
                    }
                }
            }
        }
        catch (JsonException)
        {
            detail = body;
        }

        if (string.IsNullOrWhiteSpace(detail))
        {
            return null;
        }

        return detail.Length <= MaxErrorMessageLength ? detail : detail[..MaxErrorMessageLength];
    }

    private static IrdDispatchResult Transient(string message, string? code) =>
        new(Success: false, ExternalInvoiceId: null, ErrorMessage: message, IsPermanentFailure: false, ResponseCode: code);

    private static IrdDispatchResult Permanent(string message, string? code) =>
        new(Success: false, ExternalInvoiceId: null, ErrorMessage: message, IsPermanentFailure: true, ResponseCode: code);
}
