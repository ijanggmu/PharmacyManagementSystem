using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Sales.Services;

/// <summary>Plain-text Fonepay merchant credentials, decrypted for one call.</summary>
/// <summary>Gateway base URLs, from the "FonepayOptions" configuration section.</summary>
public sealed class FonepayOptions
{
    public Uri? DevBaseUrl { get; set; }
    public Uri? LiveBaseUrl { get; set; }
}

public sealed record FonepayCredentials(string Environment, string MerchantCode, string Username, string Password, string SecretKey);

public sealed record FonepayQrResult(bool Success, string? QrMessage, string? WebSocketUrl, string? Error);

public sealed record FonepayStatusResult(bool Reached, string? PaymentStatus, string? TraceId, string? Error);

public interface IFonepayClient
{
    Task<FonepayQrResult> CreateQrAsync(
        FonepayCredentials credentials, string prn, decimal amount, string remarks1, string remarks2, CancellationToken cancellationToken);

    Task<FonepayStatusResult> GetStatusAsync(FonepayCredentials credentials, string prn, CancellationToken cancellationToken);
}

/// <summary>
/// Fonepay merchant "third-party dynamic QR" API.
///
/// <para><b>Create:</b> <c>POST {base}/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload</c> with
/// amount, remarks1, remarks2, prn, merchantCode, username, password and <c>dataValidation</c> =
/// lower-hex HMAC-SHA512(secretKey, "amount,prn,merchantCode,remarks1,remarks2"). The response's
/// <c>qrMessage</c> is the string to render as the QR; <c>thirdpartyQrWebSocketUrl</c> streams the payment
/// result.</para>
/// <para><b>Status:</b> <c>POST {base}/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus</c> with
/// prn, merchantCode, username, password and <c>dataValidation</c> = HMAC-SHA512(secretKey, "prn,merchantCode").
/// The response's <c>paymentStatus</c> is success / failed / pending, plus <c>fonepayTraceId</c>.</para>
///
/// <para>Field names and signature order follow Fonepay's merchant integration document. Check them against
/// the document Fonepay issues with your merchant credentials before going live; this has not been run
/// against the real gateway.</para>
/// </summary>
public sealed partial class HttpFonepayClient(
    IHttpClientFactory httpClientFactory,
    IOptionsMonitor<FonepayOptions> options,
    ILogger<HttpFonepayClient> logger) : IFonepayClient
{
    public const string HttpClientName = "Fonepay";

    private const string QrPath = "/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload";
    private const string StatusPath = "/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus";
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    public async Task<FonepayQrResult> CreateQrAsync(
        FonepayCredentials credentials, string prn, decimal amount, string remarks1, string remarks2, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(credentials);
        string amountText = FormatAmount(amount);
        var body = new Dictionary<string, string>
        {
            ["amount"] = amountText,
            ["remarks1"] = remarks1,
            ["remarks2"] = remarks2,
            ["prn"] = prn,
            ["merchantCode"] = credentials.MerchantCode,
            ["dataValidation"] = Sign(credentials.SecretKey, $"{amountText},{prn},{credentials.MerchantCode},{remarks1},{remarks2}"),
            ["username"] = credentials.Username,
            ["password"] = credentials.Password,
        };

        var (ok, json, error) = await PostAsync(credentials.Environment, QrPath, body, cancellationToken).ConfigureAwait(false);
        if (!ok)
        {
            return new FonepayQrResult(false, null, null, error);
        }

        string? qr = ReadString(json, "qrMessage");
        if (string.IsNullOrWhiteSpace(qr))
        {
            return new FonepayQrResult(false, null, null, ReadString(json, "message") ?? "Fonepay did not return a QR.");
        }

        return new FonepayQrResult(true, qr, ReadString(json, "thirdpartyQrWebSocketUrl"), null);
    }

    public async Task<FonepayStatusResult> GetStatusAsync(FonepayCredentials credentials, string prn, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(credentials);
        var body = new Dictionary<string, string>
        {
            ["prn"] = prn,
            ["merchantCode"] = credentials.MerchantCode,
            ["dataValidation"] = Sign(credentials.SecretKey, $"{prn},{credentials.MerchantCode}"),
            ["username"] = credentials.Username,
            ["password"] = credentials.Password,
        };

        var (ok, json, error) = await PostAsync(credentials.Environment, StatusPath, body, cancellationToken).ConfigureAwait(false);
        if (!ok)
        {
            return new FonepayStatusResult(false, null, null, error);
        }

        return new FonepayStatusResult(
            true,
            ReadString(json, "paymentStatus"),
            ReadString(json, "fonepayTraceId"),
            ReadString(json, "message"));
    }

    /// <summary>Lower-case hex HMAC-SHA512 of <paramref name="message"/> keyed by the merchant secret.</summary>
    public static string Sign(string secretKey, string message)
    {
        ArgumentNullException.ThrowIfNull(secretKey);
        ArgumentNullException.ThrowIfNull(message);
        byte[] hash = HMACSHA512.HashData(Encoding.UTF8.GetBytes(secretKey), Encoding.UTF8.GetBytes(message));
        return Convert.ToHexStringLower(hash);
    }

    /// <summary>Two decimals, invariant culture: the signed string and the sent amount must be identical.</summary>
    public static string FormatAmount(decimal amount) => amount.ToString("0.00", CultureInfo.InvariantCulture);

    /// <summary>Null when the environment's base URL is not configured (Fonepay issues the UAT URL per merchant).</summary>
    private Uri? EndpointFor(string environment, string path)
    {
        bool live = string.Equals(environment, "live", StringComparison.OrdinalIgnoreCase);
        Uri? baseUrl = live ? options.CurrentValue.LiveBaseUrl : options.CurrentValue.DevBaseUrl;
        return baseUrl is null ? null : new Uri(baseUrl.ToString().TrimEnd('/') + path);
    }

    private async Task<(bool Ok, JsonElement Json, string? Error)> PostAsync(
        string environment, string path, Dictionary<string, string> body, CancellationToken cancellationToken)
    {
        Uri? endpoint = EndpointFor(environment, path);
        if (endpoint is null)
        {
            return (false, default, string.Equals(environment, "live", StringComparison.OrdinalIgnoreCase)
                ? "Fonepay live URL is not configured (FonepayOptions:LiveBaseUrl)."
                : "Fonepay test (dev) URL is not configured. Set FonepayOptions:DevBaseUrl to the UAT URL Fonepay issued with your test credentials, or switch the environment to Live.");
        }

        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(Timeout);
        try
        {
            using var client = httpClientFactory.CreateClient(HttpClientName);
            using var response = await client
                .PostAsJsonAsync(endpoint, body, deadline.Token)
                .ConfigureAwait(false);
            string text = await response.Content.ReadAsStringAsync(deadline.Token).ConfigureAwait(false);

            JsonElement json = default;
            if (!string.IsNullOrWhiteSpace(text))
            {
                try
                {
                    json = JsonDocument.Parse(text).RootElement.Clone();
                }
                catch (JsonException)
                {
                    // Not JSON: fall through with an empty element.
                }
            }

            if (!response.IsSuccessStatusCode)
            {
                string message = ReadString(json, "message") ?? $"Fonepay returned HTTP {(int)response.StatusCode}.";
                LogGatewayRejected(logger, path, (int)response.StatusCode);
                return (false, json, message);
            }

            return (true, json, null);
        }
        catch (Exception ex) when ((ex is HttpRequestException or TaskCanceledException) && !cancellationToken.IsCancellationRequested)
        {
            LogGatewayUnreachable(logger, path, ex);
            return (false, default, "Could not reach Fonepay. Check the connection and try again.");
        }
    }

    private static string? ReadString(JsonElement json, string name)
    {
        if (json.ValueKind != JsonValueKind.Object || !json.TryGetProperty(name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null,
        };
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Fonepay rejected {Path} with HTTP {StatusCode}")]
    private static partial void LogGatewayRejected(ILogger logger, string path, int statusCode);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Fonepay {Path} could not be reached")]
    private static partial void LogGatewayUnreachable(ILogger logger, string path, Exception exception);
}
