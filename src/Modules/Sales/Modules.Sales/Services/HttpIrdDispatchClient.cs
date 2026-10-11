using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Sales.Services;

/// <summary>
/// Real <see cref="IIrdDispatchClient"/>: POSTs the queued invoice to the tenant's configured IRD / CBMS
/// endpoint. Port of the Next.js reference's <c>sendInvoiceToIrd</c> (lib/api/ird-service.ts).
///
/// <para><b>Request:</b> <c>POST {BaseUrl}/{EndpointPath}</c>, <c>Content-Type: application/json</c>, body is
/// the queued payload verbatim. Auth is <c>Basic</c> (username:password) or <c>Bearer</c> (token), per the
/// tenant's <see cref="IrdTenantOptions.AuthType"/>. Configuration comes from <see cref="IrdOptions"/>.</para>
///
/// <para><b>Response classification</b> (drives <c>ProcessIrdInvoiceQueueJob</c>'s backoff):</para>
/// <list type="bullet">
/// <item>2xx: success. <c>ExternalInvoiceId</c> is taken from <c>invoiceId</c> or <c>id</c> when the body is JSON.</item>
/// <item>408, 429, 5xx: transient (retried with backoff).</item>
/// <item>Other 4xx: permanent (the remote side rejected the invoice; retrying will not change that).</item>
/// <item>Transport errors and timeouts: transient.</item>
/// <item>Tenant not configured, or configuration incomplete or invalid: permanent, with a message saying what to fix.
/// Never reported as success.</item>
/// </list>
///
/// <para>The HTTP client is resolved from <see cref="HttpClientName"/>, which Sales registers with
/// <c>AddHeroResilience</c> (retry / circuit breaker / per-attempt timeout). Note that the resilience
/// retry re-sends a POST, so the remote side must treat <c>invoiceNumber</c> as an idempotency key for
/// that to be safe; this cannot be verified without real CBMS credentials.</para>
/// </summary>
public sealed class HttpIrdDispatchClient(
    IHttpClientFactory httpClientFactory,
    IOptionsMonitor<IrdOptions> options,
    ILogger<HttpIrdDispatchClient> logger) : IIrdDispatchClient
{
    /// <summary>Named <see cref="HttpClient"/> registered by <c>SalesModule</c>.</summary>
    public const string HttpClientName = "IrdCbms";

    /// <summary>Default overall deadline per dispatch, matching the Next.js reference (15s).</summary>
    public const int DefaultTimeoutMs = 15_000;

    private const int MaxErrorMessageLength = 500;

    public async Task<IrdDispatchResult> SendInvoiceAsync(string tenantId, string payloadJson, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(payloadJson);

        if (string.IsNullOrWhiteSpace(tenantId))
        {
            return Permanent("IRD dispatch requires a tenant identifier; the queued invoice has none.");
        }

        if (!options.CurrentValue.Tenants.TryGetValue(tenantId, out var tenant) || tenant is null)
        {
            return Permanent(
                $"IRD CBMS is not configured for tenant '{tenantId}'. " +
                "Add an IrdOptions:Tenants entry for this tenant (BaseUrl, EndpointPath, AuthType and credentials).");
        }

        if (!TryResolveRequestTarget(tenant, tenantId, out var endpoint, out var authorization, out string? configError))
        {
            return Permanent(configError);
        }

        int timeoutMs = tenant.TimeoutMs is > 0 ? tenant.TimeoutMs.Value : DefaultTimeoutMs;

        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromMilliseconds(timeoutMs));

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(payloadJson, Encoding.UTF8, "application/json"),
                Headers = { Authorization = authorization },
            };
            using var client = httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.SendAsync(request, deadline.Token).ConfigureAwait(false);
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
            return Transient($"IRD CBMS did not respond within {timeoutMs} ms for tenant '{tenantId}'.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // HttpRequestException, resilience TimeoutRejected/BrokenCircuit, etc. All transient.
            logger.LogWarning(ex, "IRD CBMS transport error for tenant {TenantId}", tenantId);
            return Transient($"IRD CBMS request failed: {ex.Message}");
        }
    }

    internal static IrdDispatchResult Classify(HttpStatusCode status, string body)
    {
        int code = (int)status;

        if (code is >= 200 and < 300)
        {
            return new IrdDispatchResult(true, TryReadExternalId(body), null, IsPermanentFailure: false);
        }

        string message = ExtractErrorMessage(body) is { Length: > 0 } detail
            ? $"IRD CBMS responded with status {code}: {detail}"
            : $"IRD CBMS responded with status {code}";

        bool transient = code is 408 or 429 || code >= 500;
        return transient ? Transient(message) : Permanent(message);
    }

    private static bool TryResolveRequestTarget(
        IrdTenantOptions tenant,
        string tenantId,
        out Uri endpoint,
        out AuthenticationHeaderValue authorization,
        out string error)
    {
        endpoint = null!;
        authorization = null!;
        error = string.Empty;

        if (string.IsNullOrWhiteSpace(tenant.BaseUrl)
            || string.IsNullOrWhiteSpace(tenant.EndpointPath)
            || string.IsNullOrWhiteSpace(tenant.AuthType))
        {
            error = $"Incomplete IRD CBMS configuration for tenant '{tenantId}': BaseUrl, EndpointPath and AuthType are required.";
            return false;
        }

        if (!Uri.TryCreate(tenant.BaseUrl, UriKind.Absolute, out var baseUri)
            || !Uri.TryCreate(baseUri, tenant.EndpointPath, out var resolved))
        {
            error = $"Invalid IRD CBMS URL for tenant '{tenantId}': BaseUrl '{tenant.BaseUrl}' + EndpointPath '{tenant.EndpointPath}'.";
            return false;
        }

        endpoint = resolved;
        if (string.Equals(tenant.AuthType.Trim(), "basic", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrEmpty(tenant.Username) || string.IsNullOrEmpty(tenant.Password))
            {
                error = $"Incomplete IRD CBMS configuration for tenant '{tenantId}': basic auth needs Username and Password.";
                return false;
            }

            authorization = new AuthenticationHeaderValue(
                "Basic",
                Convert.ToBase64String(Encoding.UTF8.GetBytes($"{tenant.Username}:{tenant.Password}")));
        }
        else if (string.Equals(tenant.AuthType.Trim(), "bearer", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrEmpty(tenant.Token))
            {
                error = $"Incomplete IRD CBMS configuration for tenant '{tenantId}': bearer auth needs Token.";
                return false;
            }

            authorization = new AuthenticationHeaderValue("Bearer", tenant.Token);
        }
        else
        {
            error = $"Unsupported IRD CBMS AuthType '{tenant.AuthType}' for tenant '{tenantId}'. Use 'basic' or 'bearer'.";
            return false;
        }

        return true;
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
            // Non-JSON 2xx body: the reference treats this as success with no external id.
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

    private static IrdDispatchResult Transient(string message) =>
        new(Success: false, ExternalInvoiceId: null, ErrorMessage: message, IsPermanentFailure: false);

    private static IrdDispatchResult Permanent(string message) =>
        new(Success: false, ExternalInvoiceId: null, ErrorMessage: message, IsPermanentFailure: true);
}
