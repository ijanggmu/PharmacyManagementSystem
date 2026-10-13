using System.Security.Cryptography;
using System.Text;

namespace FSH.Modules.Identity.Services.Approvals;

/// <summary>
/// Approval bearer tokens: 256 random bits, base64url, prefixed so they are recognisable in logs/bug reports.
/// Only <see cref="Hash"/> of a token is persisted.
/// </summary>
internal static class ApprovalTokens
{
    public const string Prefix = "apv_";

    /// <summary>How long an issued approval can be redeemed — long enough to resubmit, short enough not to linger.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(3);

    public static string Generate()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Prefix + Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    /// <summary>Lower-case hex SHA-256 of the trimmed token.</summary>
    public static string Hash(string token)
    {
        ArgumentNullException.ThrowIfNull(token);
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(token.Trim()));
        return Convert.ToHexStringLower(hash);
    }
}
