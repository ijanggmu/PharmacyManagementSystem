namespace FSH.Modules.Identity.Contracts.Services;

/// <summary>The verified claims of a Google ID token. <c>Subject</c> is Google's stable account id
/// (<c>sub</c>) — the external-login provider key.</summary>
public sealed record GoogleIdentity(
    string Subject,
    string Email,
    bool EmailVerified,
    string? GivenName,
    string? FamilyName,
    string? Name,
    string? Picture);

/// <summary>
/// Validates Google Identity Services ID tokens server-side: signature against Google's published keys,
/// issuer, audience (one of the configured client ids) and lifetime. Callers must also check
/// <see cref="GoogleIdentity.EmailVerified"/> where the email matters.
/// </summary>
public interface IGoogleIdTokenValidator
{
    /// <summary>False when no Google client id is configured — Google sign-in is then switched off.</summary>
    bool IsEnabled { get; }

    /// <summary>Throws <c>UnauthorizedException</c> for an invalid, expired or foreign token and
    /// <c>NotFoundException</c> when Google sign-in is not configured.</summary>
    Task<GoogleIdentity> ValidateAsync(string idToken, CancellationToken ct = default);
}
