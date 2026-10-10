using System.Text;

namespace FSH.Modules.Identity.Features.v1.TwoFactor;

/// <summary>Shared constants and helpers for the TOTP + recovery-code flows.</summary>
internal static class TwoFactorDefaults
{
    /// <summary>Label shown in authenticator apps (otpauth:// issuer).</summary>
    internal const string Issuer = "PharmaCare";

    /// <summary>How many one-time recovery codes are issued per set.</summary>
    internal const int RecoveryCodeCount = 10;

    private const int RecoveryCodeHalfLength = 5;

    /// <summary>
    /// Normalizes user-typed recovery codes to the exact form ASP.NET Identity stores
    /// (<c>XXXXX-XXXXX</c>, upper-case). Identity's redeem is an exact string match, so surrounding
    /// whitespace, inner spaces, lower-case input or a missing hyphen would otherwise fail.
    /// </summary>
    internal static string NormalizeRecoveryCode(string code)
    {
        ArgumentNullException.ThrowIfNull(code);

        var builder = new StringBuilder(code.Length);
        foreach (var ch in code)
        {
            if (char.IsAsciiLetterOrDigit(ch))
            {
                builder.Append(char.ToUpperInvariant(ch));
            }
        }

        var compact = builder.ToString();
        return compact.Length == RecoveryCodeHalfLength * 2
            ? string.Concat(compact.AsSpan(0, RecoveryCodeHalfLength), "-", compact.AsSpan(RecoveryCodeHalfLength))
            : compact;
    }
}
