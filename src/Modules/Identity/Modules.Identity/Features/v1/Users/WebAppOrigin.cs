using FSH.Framework.Web.Origin;

namespace FSH.Modules.Identity.Features.v1.Users;

/// <summary>
/// Base URL of the web app that emailed links (confirm email, reset password) point at. Always the configured
/// <see cref="OriginOptions.OriginUrl"/> — never the request's Host header, which a caller controls and could
/// point at a phishing domain that harvests the confirmation token.
/// </summary>
public static class WebAppOrigin
{
    public static string Resolve(OriginOptions? options)
    {
        var origin = options?.OriginUrl?.ToString();
        if (string.IsNullOrWhiteSpace(origin))
        {
            throw new InvalidOperationException("Origin URL is not configured (OriginOptions:OriginUrl).");
        }

        // Uri.ToString() adds a trailing slash for a host-only URL; callers append "/path".
        return origin.TrimEnd('/');
    }
}
