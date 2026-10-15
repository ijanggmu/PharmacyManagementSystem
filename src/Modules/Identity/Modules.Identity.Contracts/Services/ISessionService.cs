using FSH.Modules.Identity.Contracts.DTOs;

namespace FSH.Modules.Identity.Contracts.Services;

public interface ISessionService
{
    Task<UserSessionDto> CreateSessionAsync(
        string userId,
        string refreshTokenHash,
        string ipAddress,
        string userAgent,
        DateTime expiresAt,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates the session row with a caller-chosen id: the id the access token's <c>sid</c> claim already
    /// carries, so revoking the session also stops that access token.
    /// </summary>
    Task<UserSessionDto> CreateSessionAsync(
        Guid sessionId,
        string userId,
        string refreshTokenHash,
        string ipAddress,
        string userAgent,
        DateTime expiresAt,
        CancellationToken cancellationToken = default);

    Task<List<UserSessionDto>> GetUserSessionsAsync(
        string userId,
        CancellationToken cancellationToken = default);

    Task<List<UserSessionDto>> GetUserSessionsForAdminAsync(
        string userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns all sessions across the current tenant for admin views.
    /// </summary>
    /// <param name="includeInactive">When true, also returns expired/revoked sessions.</param>
    /// <param name="search">Optional substring filter applied to user name, email, or IP address.</param>
    /// <param name="skip">Pagination offset.</param>
    /// <param name="take">Pagination size (capped server-side).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task<(List<UserSessionDto> Items, long TotalCount)> GetTenantSessionsAsync(
        bool includeInactive,
        string? search,
        int skip,
        int take,
        CancellationToken cancellationToken = default);

    Task<UserSessionDto?> GetSessionAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default);

    Task<bool> RevokeSessionAsync(
        Guid sessionId,
        string revokedBy,
        string? reason = null,
        CancellationToken cancellationToken = default);

    Task<int> RevokeAllSessionsAsync(
        string userId,
        string revokedBy,
        Guid? exceptSessionId = null,
        string? reason = null,
        CancellationToken cancellationToken = default);

    Task<int> RevokeAllSessionsForAdminAsync(
        string userId,
        string revokedBy,
        string? reason = null,
        CancellationToken cancellationToken = default);

    Task<bool> RevokeSessionForAdminAsync(
        Guid sessionId,
        string revokedBy,
        string? reason = null,
        CancellationToken cancellationToken = default);

    Task UpdateSessionActivityAsync(
        string refreshTokenHash,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically rotates a session's refresh token (conditional UPDATE on the old hash, not revoked, not
    /// expired). Returns true only when exactly one session row was rotated; the caller must not hand out the
    /// new token otherwise.
    /// </summary>
    Task<bool> UpdateSessionRefreshTokenAsync(
        string oldRefreshTokenHash,
        string newRefreshTokenHash,
        DateTime newExpiresAt,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Refresh-token reuse detection: when <paramref name="refreshTokenHash"/> matches a live session's
    /// previous (already rotated) token, revokes that session and returns true.
    /// </summary>
    Task<bool> RevokeSessionOnRefreshTokenReuseAsync(
        string refreshTokenHash,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// True when a live (not revoked, not expired) session currently holds <paramref name="refreshTokenHash"/>.
    /// A token with no session row is rejected.
    /// </summary>
    Task<bool> ValidateSessionAsync(
        string refreshTokenHash,
        CancellationToken cancellationToken = default);

    Task<Guid?> GetSessionIdByRefreshTokenAsync(
        string refreshTokenHash,
        CancellationToken cancellationToken = default);

    Task CleanupExpiredSessionsAsync(
        CancellationToken cancellationToken = default);
}