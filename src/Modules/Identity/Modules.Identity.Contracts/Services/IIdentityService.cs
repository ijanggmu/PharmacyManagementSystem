using System.Security.Claims;

namespace FSH.Modules.Identity.Contracts.Services;

public interface IIdentityService
{
    /// <summary>
    /// Validates the provided user credentials and returns a unique subject ID with associated claims.
    /// </summary>
    /// <param name="email">User email or username</param>
    /// <param name="password">User password</param>
    /// <param name="twoFactorCode">Optional two-factor authentication (TOTP) code</param>
    /// <param name="recoveryCode">Optional one-time two-factor recovery code, used instead of a TOTP code</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>Subject ID and claims, or null if invalid</returns>
    Task<(string Subject, IEnumerable<Claim> Claims)?>
        ValidateCredentialsAsync(string email, string password, string? twoFactorCode = null, string? recoveryCode = null, CancellationToken ct = default);

    /// <summary>
    /// Validates a refresh token and returns its claims if valid.
    /// </summary>
    Task<(string Subject, IEnumerable<Claim> Claims)?>
        ValidateRefreshTokenAsync(string refreshToken, CancellationToken ct = default);

    /// <summary>
    /// Persists a hashed refresh token for the specified subject.
    /// </summary>
    Task StoreRefreshTokenAsync(string subject, string refreshToken, DateTime expiresAtUtc, CancellationToken ct = default);

    /// <summary>
    /// Builds the claim set for a user located in an arbitrary tenant, bypassing Finbuckle's tenant
    /// query filters. Used for impersonation and end-impersonation flows where the current request's
    /// tenant context differs from the target user's tenant. Returns null if the user is not found.
    /// </summary>
    Task<(string Subject, IEnumerable<Claim> Claims)?>
        BuildClaimsForUserAsync(string userId, string tenantId, CancellationToken ct = default);

    /// <summary>
    /// Signs in through an external login (e.g. Google) already connected to a user of the current
    /// tenant, applying the same checks as a password login: lockout, active and confirmed user, tenant
    /// validity, and two-factor when enabled. Throws <c>UnauthorizedException</c> when no user of this
    /// tenant has that login.
    /// </summary>
    Task<(string Subject, IEnumerable<Claim> Claims)>
        ValidateExternalLoginAsync(string provider, string providerKey, string? twoFactorCode = null, string? recoveryCode = null, CancellationToken ct = default);

    /// <summary>Ids of the tenants in which an external login is connected to a user (cross-tenant).</summary>
    Task<IReadOnlyList<string>> FindExternalLoginTenantsAsync(string provider, string providerKey, CancellationToken ct = default);
}