using System.Security.Claims;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Authorization.Jwt;
using FSH.Modules.Identity.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;

namespace FSH.Modules.Identity.Services;

/// <summary>What the token-validation hook needs to know about a token's user or session.</summary>
internal enum TokenSubjectState : byte
{
    Active = 0,
    /// <summary>User deactivated (deleted users are deactivated) or session revoked.</summary>
    Inactive = 1,
    /// <summary>No row: the user or session no longer exists (or the tenant is gone).</summary>
    Missing = 2,
}

/// <summary>Loads the live user / session state behind an access token from the token's own tenant.</summary>
internal interface IAccessTokenStateStore
{
    Task<TokenSubjectState> GetUserStateAsync(string tenantId, string userId, CancellationToken cancellationToken);

    Task<TokenSubjectState> GetSessionStateAsync(string tenantId, Guid sessionId, CancellationToken cancellationToken);
}

/// <summary>
/// Drops cached token state the moment a user is deactivated or a session revoked, so their access tokens stop
/// working on the next request instead of after the cache lifetime.
/// </summary>
public interface IAccessTokenStateCache
{
    Task InvalidateUserAsync(string tenantId, string userId, CancellationToken cancellationToken = default);

    Task InvalidateSessionsAsync(string tenantId, IEnumerable<Guid> sessionIds, CancellationToken cancellationToken = default);
}

/// <summary>
/// Server-side teeth for deactivation and session revocation: an access token stays valid on its signature until
/// it expires, so the JWT hook asks this service whether the token's user is still active and its session (the
/// <c>sid</c> claim) is still live. Answers are cached for <see cref="CacheLifetime"/> so the check is not a
/// database hit per request; deactivating a user or revoking a session drops the entry straight away.
/// </summary>
internal sealed class AccessTokenStateService(HybridCache cache, IAccessTokenStateStore store) : IAccessTokenStateCache
{
    internal static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(30);

    private static readonly HybridCacheEntryOptions EntryOptions = new()
    {
        Expiration = CacheLifetime,
        LocalCacheExpiration = CacheLifetime,
        Flags = HybridCacheEntryFlags.DisableCompression,
    };

    internal static string UserKey(string tenantId, string userId) => $"identity:token-state:user:{tenantId}:{userId}";

    internal static string SessionKey(string tenantId, Guid sessionId) => $"identity:token-state:session:{tenantId}:{sessionId}";

    /// <summary>Null when the token may be used; otherwise why it is refused.</summary>
    public async Task<string?> GetRejectionReasonAsync(ClaimsPrincipal? principal, CancellationToken cancellationToken = default)
    {
        string? userId = principal?.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal?.FindFirstValue("sub");
        string? tenantId = principal?.FindFirstValue(ClaimConstants.Tenant);
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(tenantId))
        {
            // Every token this API issues carries both; nothing to look up otherwise.
            return null;
        }

        var userState = await cache.GetOrCreateAsync(
            UserKey(tenantId, userId),
            new UserLookup(store, tenantId, userId),
            static (s, ct) => new ValueTask<TokenSubjectState>(s.Store.GetUserStateAsync(s.TenantId, s.UserId, ct)),
            EntryOptions,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        if (userState != TokenSubjectState.Active)
        {
            return "user is deactivated or no longer exists";
        }

        if (SessionClaims.GetSessionId(principal) is not Guid sessionId)
        {
            // Tokens minted before sessions were stamped on them; they expire on their own.
            return null;
        }

        var sessionState = await cache.GetOrCreateAsync(
            SessionKey(tenantId, sessionId),
            new SessionLookup(store, tenantId, sessionId),
            static (s, ct) => new ValueTask<TokenSubjectState>(s.Store.GetSessionStateAsync(s.TenantId, s.SessionId, ct)),
            EntryOptions,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        return sessionState == TokenSubjectState.Active ? null : "session has been revoked";
    }

    public Task InvalidateUserAsync(string tenantId, string userId, CancellationToken cancellationToken = default)
        => cache.RemoveAsync(UserKey(tenantId, userId), cancellationToken).AsTask();

    public async Task InvalidateSessionsAsync(string tenantId, IEnumerable<Guid> sessionIds, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(sessionIds);

        foreach (var sessionId in sessionIds)
        {
            await cache.RemoveAsync(SessionKey(tenantId, sessionId), cancellationToken).ConfigureAwait(false);
        }
    }

    private readonly record struct UserLookup(IAccessTokenStateStore Store, string TenantId, string UserId);

    private readonly record struct SessionLookup(IAccessTokenStateStore Store, string TenantId, Guid SessionId);
}

/// <summary>
/// Reads users and sessions in the token's tenant. The JWT hook runs before Finbuckle resolves the request's
/// tenant, so each lookup opens its own scope with the tenant set explicitly (tenant query filters and a
/// tenant's own connection string then apply as usual).
/// </summary>
internal sealed class AccessTokenStateStore(IServiceScopeFactory scopeFactory, TimeProvider timeProvider) : IAccessTokenStateStore
{
    public async Task<TokenSubjectState> GetUserStateAsync(string tenantId, string userId, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var tenant = await FindTenantAsync(scope.ServiceProvider, tenantId).ConfigureAwait(false);
        if (tenant is null)
        {
            return TokenSubjectState.Missing;
        }

        // Set the tenant and build the context in this method's own flow (Finbuckle's accessor is AsyncLocal).
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();

        bool? isActive = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => (bool?)u.IsActive)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return isActive switch
        {
            true => TokenSubjectState.Active,
            false => TokenSubjectState.Inactive,
            null => TokenSubjectState.Missing,
        };
    }

    public async Task<TokenSubjectState> GetSessionStateAsync(string tenantId, Guid sessionId, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var tenant = await FindTenantAsync(scope.ServiceProvider, tenantId).ConfigureAwait(false);
        if (tenant is null)
        {
            return TokenSubjectState.Missing;
        }

        // Set the tenant and build the context in this method's own flow (Finbuckle's accessor is AsyncLocal).
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();

        var session = await db.UserSessions
            .AsNoTracking()
            .Where(s => s.Id == sessionId)
            .Select(s => new { s.IsRevoked, s.ExpiresAt })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        if (session is null)
        {
            return TokenSubjectState.Missing;
        }

        return session.IsRevoked || session.ExpiresAt <= timeProvider.GetUtcNow().UtcDateTime
            ? TokenSubjectState.Inactive
            : TokenSubjectState.Active;
    }

    private static Task<AppTenantInfo?> FindTenantAsync(IServiceProvider services, string tenantId)
        => services.GetRequiredService<IMultiTenantStore<AppTenantInfo>>().GetAsync(tenantId);
}
