using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace FSH.Modules.Identity.Authorization.Jwt;

/// <summary>
/// The access token's link to its <c>UserSession</c> row: a <c>sid</c> claim holding the session id. Every
/// token-issuing flow stamps it (login, external login, refresh, end-impersonation), so revoking a session also
/// stops the access tokens minted for it, not just its refresh token. JwtBearer maps the inbound <c>sid</c> to
/// <see cref="ClaimTypes.Sid"/>, so readers accept both spellings.
/// </summary>
public static class SessionClaims
{
    public const string SessionId = JwtRegisteredClaimNames.Sid;

    public static Guid? GetSessionId(IEnumerable<Claim>? claims)
    {
        if (claims is null)
        {
            return null;
        }

        string? value = claims.FirstOrDefault(c => IsSessionClaim(c.Type))?.Value;
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public static Guid? GetSessionId(ClaimsPrincipal? principal) => GetSessionId(principal?.Claims);

    /// <summary>The claims with any existing session id replaced by <paramref name="sessionId"/>.</summary>
    public static IReadOnlyList<Claim> WithSessionId(IEnumerable<Claim> claims, Guid sessionId)
    {
        ArgumentNullException.ThrowIfNull(claims);

        var result = claims.Where(c => !IsSessionClaim(c.Type)).ToList();
        result.Add(new Claim(SessionId, sessionId.ToString()));
        return result;
    }

    private static bool IsSessionClaim(string type) =>
        string.Equals(type, SessionId, StringComparison.Ordinal)
        || string.Equals(type, ClaimTypes.Sid, StringComparison.Ordinal);
}
