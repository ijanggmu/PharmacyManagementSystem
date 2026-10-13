using System.Globalization;
using System.Net;
using System.Text.Json;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Notifications.Sms.Providers;

/// <summary>Host-wide SMS gateway endpoints ("SmsOptions" section). Per-tenant credentials live in SmsSettings.</summary>
public sealed class SmsOptions
{
#pragma warning disable S1075 // The gateways' published endpoints; only defaults, overridable by configuration.
    public const string DefaultSparrowUrl = "https://api.sparrowsms.com/v2/sms/";
    public const string DefaultAakashUrl = "https://sms.aakashsms.com/sms/v3/send";
#pragma warning restore S1075

    public string SparrowUrl { get; set; } = DefaultSparrowUrl;
    public string AakashUrl { get; set; } = DefaultAakashUrl;

    /// <summary>Overall deadline per gateway call.</summary>
    public int TimeoutMs { get; set; } = 15_000;
}

/// <summary>One message to one number. <see cref="Token"/> is the decrypted gateway token — never log this record.</summary>
public sealed record SmsSendRequest(string To, string Text, string? SenderId, string? Token)
{
    public override string ToString() => $"SmsSendRequest {{ To = {SmsPhone.Mask(To)} }}";
}

/// <summary>
/// The gateway's answer. <see cref="IsPermanentFailure"/>: retrying cannot help (bad token, unknown sender, invalid
/// number, no credit) — the message fails at once. Otherwise a failure is retried with backoff.
/// </summary>
public sealed record SmsSendResult(
    bool Success,
    bool IsPermanentFailure,
    string? ResponseCode,
    string? ResponseMessage,
    string? ProviderMessageId = null,
    decimal? Credits = null,
    string? Error = null)
{
    public static SmsSendResult Transient(string error, string? code = null) => new(false, false, code, null, Error: error);

    public static SmsSendResult Permanent(string error, string? code = null, string? message = null) => new(false, true, code, message, Error: error);
}

public interface ISmsProvider
{
    /// <summary>One of <see cref="SmsProviderNames"/>.</summary>
    string Name { get; }

    Task<SmsSendResult> SendAsync(SmsSendRequest request, CancellationToken cancellationToken);
}

/// <summary>Picks the provider a tenant chose.</summary>
public sealed class SmsProviderResolver(IEnumerable<ISmsProvider> providers)
{
    private readonly Dictionary<string, ISmsProvider> _byName =
        providers.ToDictionary(p => p.Name, StringComparer.OrdinalIgnoreCase);

    public ISmsProvider? Get(string name) => _byName.GetValueOrDefault(name);
}

/// <summary>
/// Development / test provider: nothing leaves the server. Logs that a message would have been sent (masked number,
/// size — never the text, which carries the customer's name and amounts) and reports it accepted.
/// </summary>
public sealed partial class LogOnlySmsProvider(ILogger<LogOnlySmsProvider> logger) : ISmsProvider
{
    public string Name => SmsProviderNames.LogOnly;

    public Task<SmsSendResult> SendAsync(SmsSendRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (logger.IsEnabled(LogLevel.Information))
        {
            var size = SmsText.Count(request.Text);
            string masked = SmsPhone.Mask(request.To);
            LogWouldSend(logger, masked, size.Segments, size.Encoding);
        }

        return Task.FromResult(new SmsSendResult(true, false, "log-only", "Logged, not sent (log-only provider).",
            string.Create(CultureInfo.InvariantCulture, $"log-{Guid.NewGuid():N}"), 0m));
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "SMS (log-only provider) to {Phone}: {Segments} {Encoding} segment(s), not sent")]
    private static partial void LogWouldSend(ILogger logger, string phone, int segments, string encoding);
}

/// <summary>
/// Shared HTTP plumbing for the gateways: POSTs an <c>application/x-www-form-urlencoded</c> body on the named
/// <see cref="HttpClientName"/> client (registered with <c>AddHeroResilience</c>, retries of the POST turned off so a lost
/// response never sends a customer the same SMS twice — <c>ProcessSmsQueueJob</c> retries with backoff instead), and
/// sorts transport failures: timeouts, HTTP 408/429/5xx and connection errors are transient.
/// </summary>
public abstract partial class HttpSmsProvider(IHttpClientFactory httpClientFactory, IOptionsMonitor<SmsOptions> options, ILogger logger)
    : ISmsProvider
{
    public const string HttpClientName = "SmsGateway";

    private const int MaxMessageLength = 300;

    public abstract string Name { get; }

    protected abstract Uri Endpoint(SmsOptions current);

    /// <summary>The form fields the gateway expects, in order.</summary>
    public abstract IReadOnlyList<KeyValuePair<string, string>> BuildForm(SmsSendRequest request);

    /// <summary>Reads a gateway answer (any HTTP status) into a result.</summary>
    public abstract SmsSendResult Classify(HttpStatusCode status, string body);

    public async Task<SmsSendResult> SendAsync(SmsSendRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var current = options.CurrentValue;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, current.TimeoutMs)));
        var endpoint = Endpoint(current);

        try
        {
            using var content = new FormUrlEncodedContent(BuildForm(request));
            using var message = new HttpRequestMessage(HttpMethod.Post, endpoint) { Content = content };
            using var client = httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.SendAsync(message, deadline.Token).ConfigureAwait(false);
            string body = await response.Content.ReadAsStringAsync(deadline.Token).ConfigureAwait(false);
            return Classify(response.StatusCode, body);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException) when (deadline.IsCancellationRequested)
        {
            return SmsSendResult.Transient($"{Name} did not respond in time.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            LogTransportError(logger, ex, Name, endpoint.Host);
            return SmsSendResult.Transient($"{Name} request failed: {ex.GetType().Name}.");
        }
    }

    /// <summary>HTTP 408, 429 and 5xx are worth retrying; other non-2xx answers are not.</summary>
    protected static bool IsTransientStatus(HttpStatusCode status) =>
        status is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests || (int)status >= 500;

    protected static string HttpCode(HttpStatusCode status) => ((int)status).ToString(CultureInfo.InvariantCulture);

    protected static JsonElement? TryParse(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    protected static string? Text(JsonElement? root, string property)
    {
        if (root is not { ValueKind: JsonValueKind.Object } element || !element.TryGetProperty(property, out var value))
        {
            return null;
        }

        string? text = value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null,
        };
        return text is { Length: > MaxMessageLength } ? text[..MaxMessageLength] : text;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "SMS gateway {Provider} at {Host} could not be reached")]
    private static partial void LogTransportError(ILogger logger, Exception exception, string provider, string host);
}

/// <summary>
/// Sparrow SMS — <c>POST https://api.sparrowsms.com/v2/sms/</c>, form fields <c>token</c>, <c>from</c> (the sender
/// identity Sparrow issued), <c>to</c> (10-digit mobile number, comma-separated for several) and <c>text</c>. It answers
/// JSON <c>{"count":1,"response_code":200,"response":"1 mesages has been queued for delivery"}</c> on success and a 4xx
/// with <c>{"response_code":1002,"response":"Invalid Token"}</c> on error (1000-1013: missing field, bad IP, bad token,
/// inactive / expired account, invalid receiver / sender, no or insufficient credit — all permanent).
/// <b>These field names and codes follow Sparrow's published v2 API and must be checked against Sparrow's current
/// documentation before going live.</b> Sparrow's send call reports no credit figure.
/// </summary>
public sealed class SparrowSmsProvider(
    IHttpClientFactory httpClientFactory, IOptionsMonitor<SmsOptions> options, ILogger<SparrowSmsProvider> logger)
    : HttpSmsProvider(httpClientFactory, options, logger)
{
    public override string Name => SmsProviderNames.Sparrow;

    protected override Uri Endpoint(SmsOptions current) => new(current.SparrowUrl);

    public override IReadOnlyList<KeyValuePair<string, string>> BuildForm(SmsSendRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return
        [
            new("token", request.Token ?? string.Empty),
            new("from", request.SenderId ?? string.Empty),
            new("to", request.To),
            new("text", request.Text),
        ];
    }

    public override SmsSendResult Classify(HttpStatusCode status, string body)
    {
        var root = TryParse(body);
        string? code = Text(root, "response_code");
        string? message = Text(root, "response");

        if ((int)status is >= 200 and < 300 && code == "200")
        {
            return new SmsSendResult(true, false, code, message);
        }

        if (IsTransientStatus(status))
        {
            return SmsSendResult.Transient($"Sparrow SMS answered HTTP {HttpCode(status)}.", code ?? HttpCode(status));
        }

        return SmsSendResult.Permanent(
            $"Sparrow SMS refused the message: {message ?? "no reason given"}.", code ?? HttpCode(status), message);
    }
}

/// <summary>
/// Aakash SMS — <c>POST https://sms.aakashsms.com/sms/v3/send</c>, form fields <c>auth_token</c>, <c>to</c>
/// (10-digit mobile number, comma-separated for several) and <c>text</c>; the sender is fixed on the Aakash account.
/// It answers JSON <c>{"error":false,"message":"…","data":{"valid":[{"id":…,"mobile":"98…","credit":1,…}],"invalid":[…]}}</c>;
/// <c>"error":true</c> (bad token, no credit) is permanent, as is a number listed under <c>invalid</c>. Credits are the
/// sum of <c>valid[].credit</c>. <b>These field names follow Aakash's published v3 API and must be checked against
/// Aakash's current documentation before going live.</b>
/// </summary>
public sealed class AakashSmsProvider(
    IHttpClientFactory httpClientFactory, IOptionsMonitor<SmsOptions> options, ILogger<AakashSmsProvider> logger)
    : HttpSmsProvider(httpClientFactory, options, logger)
{
    public override string Name => SmsProviderNames.Aakash;

    protected override Uri Endpoint(SmsOptions current) => new(current.AakashUrl);

    public override IReadOnlyList<KeyValuePair<string, string>> BuildForm(SmsSendRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return
        [
            new("auth_token", request.Token ?? string.Empty),
            new("to", request.To),
            new("text", request.Text),
        ];
    }

    public override SmsSendResult Classify(HttpStatusCode status, string body)
    {
        var root = TryParse(body);
        string? message = Text(root, "message");
        string httpCode = HttpCode(status);

        if (IsTransientStatus(status))
        {
            return SmsSendResult.Transient($"Aakash SMS answered HTTP {httpCode}.", httpCode);
        }

        if (root is not { ValueKind: JsonValueKind.Object } element)
        {
            return (int)status is >= 200 and < 300
                ? SmsSendResult.Transient("Aakash SMS sent an answer that could not be read.", httpCode)
                : SmsSendResult.Permanent($"Aakash SMS answered HTTP {httpCode}.", httpCode);
        }

        bool error = element.TryGetProperty("error", out var errorFlag) && errorFlag.ValueKind == JsonValueKind.True;
        var valid = new List<JsonElement>();
        if (element.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object
            && data.TryGetProperty("valid", out var validList) && validList.ValueKind == JsonValueKind.Array)
        {
            valid.AddRange(validList.EnumerateArray());
        }

        if ((int)status is >= 200 and < 300 && !error && valid.Count > 0)
        {
            decimal credits = 0m;
            foreach (var item in valid)
            {
                if (item.TryGetProperty("credit", out var credit) && credit.ValueKind == JsonValueKind.Number)
                {
                    credits += credit.GetDecimal();
                }
            }

            string? id = Text(valid[0], "id");
            return new SmsSendResult(true, false, httpCode, message, id, credits);
        }

        return SmsSendResult.Permanent(
            valid.Count == 0 && !error
                ? "Aakash SMS rejected the number."
                : $"Aakash SMS refused the message: {message ?? "no reason given"}.",
            httpCode,
            message);
    }
}
