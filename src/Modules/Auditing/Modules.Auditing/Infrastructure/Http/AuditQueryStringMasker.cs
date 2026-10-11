using System.Text;
using Microsoft.AspNetCore.Http;

namespace FSH.Modules.Auditing;

/// <summary>
/// Renders a request query string for the audit trail with sensitive values (tokens, passwords,
/// secrets, API keys, OTPs, signatures) replaced by <c>****</c>. Keys are kept so the shape of the
/// request stays visible. Output is capped so a pathological URL cannot bloat the audit row.
/// </summary>
public static class AuditQueryStringMasker
{
    public const string MaskValue = "****";
    public const int MaxLength = 2_048;

    // Substrings that mark a key as sensitive wherever they appear (accessToken, newPassword, clientSecret…).
    private static readonly string[] SensitiveFragments =
    [
        "token", "password", "passwd", "secret", "apikey", "api_key", "api-key",
        "signature", "authorization", "credential", "session",
    ];

    // Short keys that are only sensitive as the whole key — as substrings they would over-mask
    // business filters such as "barcode", "shipping" or "design".
    private static readonly HashSet<string> SensitiveExactKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "key", "code", "otp", "pin", "pwd", "sig", "auth", "jwt", "access_token", "id_token", "state",
    };

    /// <summary>True when a query key should have its value masked.</summary>
    public static bool IsSensitiveKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        var k = key.Trim();
        if (SensitiveExactKeys.Contains(k)
            || k.EndsWith("Key", StringComparison.Ordinal)      // apiKey, accessKey, signingKey (camelCase)
            || k.EndsWith("_key", StringComparison.OrdinalIgnoreCase)
            || k.EndsWith("-key", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        foreach (var fragment in SensitiveFragments)
        {
            if (k.Contains(fragment, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>Masks a raw query string (with or without the leading '?'). Returns null when empty.</summary>
    public static string? Mask(string? rawQuery)
    {
        if (string.IsNullOrEmpty(rawQuery))
        {
            return null;
        }

        var query = rawQuery[0] == '?' ? rawQuery[1..] : rawQuery;
        if (query.Length == 0)
        {
            return null;
        }

        var sb = new StringBuilder(query.Length + 1);
        sb.Append('?');
        var first = true;
        foreach (var part in query.Split('&'))
        {
            if (part.Length == 0)
            {
                continue;
            }

            if (!first)
            {
                sb.Append('&');
            }
            first = false;

            var eq = part.IndexOf('=', StringComparison.Ordinal);
            var rawKey = eq < 0 ? part : part[..eq];
            string decodedKey;
            try
            {
                decodedKey = Uri.UnescapeDataString(rawKey.Replace('+', ' '));
            }
            catch (UriFormatException)
            {
                decodedKey = rawKey;
            }

            if (eq >= 0 && IsSensitiveKey(decodedKey))
            {
                sb.Append(rawKey).Append('=').Append(MaskValue);
            }
            else
            {
                sb.Append(part);
            }

            if (sb.Length > MaxLength)
            {
                break;
            }
        }

        if (sb.Length <= 1)
        {
            return null;
        }

        return sb.Length > MaxLength ? sb.ToString(0, MaxLength) + "…" : sb.ToString();
    }

    public static string? Mask(QueryString queryString) =>
        queryString.HasValue ? Mask(queryString.Value) : null;
}
