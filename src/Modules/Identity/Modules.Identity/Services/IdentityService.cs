using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Features.v1.TwoFactor;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;

namespace FSH.Modules.Identity.Services;

public sealed class IdentityService : IIdentityService
{
    private readonly UserManager<FshUser> _userManager;
    private readonly ILogger<IdentityService> _logger;
    private readonly IMultiTenantContextAccessor<AppTenantInfo>? _multiTenantContextAccessor;
    private readonly IGroupRoleService _groupRoleService;
    private readonly TimeProvider _timeProvider;
    private readonly IdentityDbContext _dbContext;
    private readonly IUserPermissionService _userPermissionService;
    private readonly IAuditClient _auditClient;
    private readonly int _gracePeriodDays;

    public IdentityService(
        UserManager<FshUser> userManager,
        IMultiTenantContextAccessor<AppTenantInfo>? multiTenantContextAccessor,
        ILogger<IdentityService> logger,
        IGroupRoleService groupRoleService,
        TimeProvider timeProvider,
        IdentityDbContext dbContext,
        IUserPermissionService userPermissionService,
        IOptions<TenantGraceOptions> graceOptions,
        IAuditClient auditClient)
    {
        ArgumentNullException.ThrowIfNull(graceOptions);
        _userManager = userManager;
        _multiTenantContextAccessor = multiTenantContextAccessor;
        _logger = logger;
        _groupRoleService = groupRoleService;
        _timeProvider = timeProvider;
        _dbContext = dbContext;
        _userPermissionService = userPermissionService;
        _auditClient = auditClient;
        _gracePeriodDays = graceOptions.Value.GracePeriodDays;
    }

    public async Task<(string Subject, IEnumerable<Claim> Claims)?>
        ValidateCredentialsAsync(string email, string password, string? twoFactorCode = null, string? recoveryCode = null, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(email);
        ArgumentNullException.ThrowIfNull(password);

        var tenant = GetValidatedTenant();
        var user = await FindAndValidateUserByCredentialsAsync(email, password);

        ValidateUserStatus(user);
        ValidateTenantStatus(tenant);

        if (user.TwoFactorEnabled)
        {
            if (!string.IsNullOrWhiteSpace(recoveryCode))
            {
                await RedeemRecoveryCodeOrThrowAsync(user, recoveryCode, tenant.Id, ct).ConfigureAwait(false);
            }
            else
            {
                await VerifyTwoFactorOrThrowAsync(user, twoFactorCode);
            }
        }

        var claims = await BuildUserClaimsAsync(user, tenant.Id, ct);
        return (user.Id, claims);
    }

    public async Task<(string Subject, IEnumerable<Claim> Claims)>
        ValidateExternalLoginAsync(string provider, string providerKey, string? twoFactorCode = null, string? recoveryCode = null, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);
        ArgumentException.ThrowIfNullOrWhiteSpace(providerKey);

        var tenant = GetValidatedTenant();

        // Tenant-filtered: only a login connected to a user of THIS tenant signs in.
        var user = await _userManager.FindByLoginAsync(provider, providerKey).ConfigureAwait(false)
            ?? throw new UnauthorizedException("external_login_not_linked: This account isn't connected to a user of this pharmacy.");

        if (_userManager.SupportsUserLockout && await _userManager.IsLockedOutAsync(user).ConfigureAwait(false))
        {
            _logger.LogWarning("External login attempted for locked account {UserId}", user.Id);
            throw new CustomException(
                "Account is temporarily locked due to too many failed login attempts. Try again later.",
                errors: null,
                HttpStatusCode.Locked);
        }

        ValidateUserStatus(user);
        ValidateTenantStatus(tenant);

        if (user.TwoFactorEnabled)
        {
            if (!string.IsNullOrWhiteSpace(recoveryCode))
            {
                await RedeemRecoveryCodeOrThrowAsync(user, recoveryCode, tenant.Id, ct).ConfigureAwait(false);
            }
            else
            {
                await VerifyTwoFactorOrThrowAsync(user, twoFactorCode).ConfigureAwait(false);
            }
        }

        var claims = await BuildUserClaimsAsync(user, tenant.Id, ct).ConfigureAwait(false);
        return (user.Id, claims);
    }

    public async Task<IReadOnlyList<string>> FindExternalLoginTenantsAsync(string provider, string providerKey, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);
        ArgumentException.ThrowIfNullOrWhiteSpace(providerKey);

        // Cross-tenant by design (the tenant isn't known yet): bypass the Finbuckle filter and read the
        // TenantId explicitly. Only reachable after the caller has verified the external token.
        return await _dbContext.UserLogins
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(l => l.LoginProvider == provider && l.ProviderKey == providerKey)
            .Select(l => EF.Property<string>(l, "TenantId"))
            .Distinct()
            .ToListAsync(ct)
            .ConfigureAwait(false);
    }

    private async Task VerifyTwoFactorOrThrowAsync(FshUser user, string? twoFactorCode)
    {
        if (string.IsNullOrWhiteSpace(twoFactorCode))
        {
            throw new CustomException(
                "two_factor_required: An authenticator code is required to complete sign-in.",
                errors: null,
                HttpStatusCode.Unauthorized);
        }

        var valid = await _userManager.VerifyTwoFactorTokenAsync(
            user,
            _userManager.Options.Tokens.AuthenticatorTokenProvider,
            twoFactorCode);

        if (!valid)
        {
            _logger.LogWarning("Invalid two-factor code for user {UserId}", user.Id);
            throw new UnauthorizedException("two_factor_invalid: The authenticator code is invalid or expired.");
        }
    }

    private async Task RedeemRecoveryCodeOrThrowAsync(FshUser user, string recoveryCode, string tenantId, CancellationToken ct)
    {
        // Identity's redeem is an exact match against the stored "XXXXX-XXXXX" codes, and consumes the
        // code on success, so each recovery code works exactly once.
        var normalized = TwoFactorDefaults.NormalizeRecoveryCode(recoveryCode);
        var result = await _userManager.RedeemTwoFactorRecoveryCodeAsync(user, normalized).ConfigureAwait(false);

        if (!result.Succeeded)
        {
            _logger.LogWarning("Invalid two-factor recovery code for user {UserId} in tenant {TenantId}", user.Id, tenantId);
            throw new UnauthorizedException("two_factor_invalid: The recovery code is invalid or has already been used.");
        }

        var codesLeft = await _userManager.CountRecoveryCodesAsync(user).ConfigureAwait(false);
        _logger.LogWarning(
            "User {UserId} in tenant {TenantId} signed in with a two-factor recovery code; {CodesLeft} codes left",
            user.Id,
            tenantId,
            codesLeft);

        await _auditClient.WriteActivityAsync(
            ActivityKind.Command,
            name: "TwoFactorRecoveryCodeRedeemed",
            statusCode: 200,
            durationMs: 0,
            requestPreview: new { userId = user.Id, tenant = tenantId },
            responsePreview: new { outcome = "success", recoveryCodesLeft = codesLeft },
            severity: AuditSeverity.Warning,
            source: "Identity",
            ct: ct).ConfigureAwait(false);
    }

    public async Task<(string Subject, IEnumerable<Claim> Claims)?>
        ValidateRefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        var tenant = GetValidatedTenant();
        var (user, expiresAtUtc) = await FindUserByRefreshTokenAsync(refreshToken, tenant.Id, ct);

        ValidateRefreshTokenExpiry(user, expiresAtUtc);
        ValidateUserStatus(user);
        ValidateTenantStatus(tenant);

        var claims = await BuildUserClaimsAsync(user, tenant.Id, ct);
        return (user.Id, claims);
    }

    public async Task StoreRefreshTokenAsync(string subject, string refreshToken, DateTime expiresAtUtc, CancellationToken ct = default)
    {
        // Targeted UPDATE bypasses tracking + Finbuckle interceptors (which NRE on cross-tenant IgnoreQueryFilters).
        // Safe: user IDs are globally unique GUIDs, so exactly one row matches Id == subject regardless of tenant.
        var hashedToken = HashToken(refreshToken);
        var updated = await _dbContext.Users
            .IgnoreQueryFilters()
            .Where(u => u.Id == subject)
            .ExecuteUpdateAsync(
                s => s.SetProperty(u => u.RefreshToken, hashedToken)
                      .SetProperty(u => u.RefreshTokenExpiryTime, expiresAtUtc),
                ct).ConfigureAwait(false);

        if (updated == 0)
        {
            throw new UnauthorizedException("user not found");
        }

        if (_logger.IsEnabled(LogLevel.Debug))
        {
            _logger.LogDebug(
                "Stored refresh token for user {UserId}. Token hash: {TokenHash}, Expires: {ExpiresAt}",
                subject, hashedToken[..Math.Min(8, hashedToken.Length)], expiresAtUtc);
        }
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(refreshToken);
        var tenant = GetValidatedTenant();

        // Tenant-filtered (no IgnoreQueryFilters): a token can only be revoked in its own tenant.
        var hashedToken = HashToken(refreshToken);
        await _dbContext.Users
            .Where(u => u.RefreshToken == hashedToken)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.RefreshToken, (string?)null), ct)
            .ConfigureAwait(false);

        var sessionHash = SessionTokenHash(refreshToken);
        var sessions = await _dbContext.UserSessions
            .Where(s => !s.IsRevoked && s.RefreshTokenHash == sessionHash)
            .ToListAsync(ct)
            .ConfigureAwait(false);
        foreach (var session in sessions)
        {
            session.Revoke(session.UserId, "Signed out", tenant.Id);
        }

        if (sessions.Count > 0)
        {
            await _dbContext.SaveChangesAsync(ct).ConfigureAwait(false);
        }
    }

    public async Task<(string Subject, IEnumerable<Claim> Claims)?>
        BuildClaimsForUserAsync(string userId, string tenantId, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(userId);
        ArgumentNullException.ThrowIfNull(tenantId);

        // IgnoreQueryFilters bypasses Finbuckle's tenant filter so root-tenant callers can
        // resolve users in other tenants during impersonation.
        var user = await _userManager.Users
            .IgnoreQueryFilters()
            .Where(u => u.Id == userId && EF.Property<string>(u, "TenantId") == tenantId)
            .FirstOrDefaultAsync(ct);

        if (user is null)
        {
            return null;
        }

        ValidateUserStatus(user);

        var claims = CreateBasicClaims(user, tenantId);

        var userRoleIds = await _dbContext.UserRoles
            .IgnoreQueryFilters()
            .Where(ur => ur.UserId == userId)
            .Select(ur => ur.RoleId)
            .ToListAsync(ct);

        if (userRoleIds.Count > 0)
        {
            var roleNames = await _dbContext.Roles
                .IgnoreQueryFilters()
                .Where(r => userRoleIds.Contains(r.Id) && EF.Property<string>(r, "TenantId") == tenantId)
                .Select(r => r.Name!)
                .ToListAsync(ct);

            claims.AddRange(roleNames.Select(r => new Claim(ClaimTypes.Role, r)));
        }

        await AddPermissionClaimsAsync(claims, user.Id, ct);

        return (user.Id, claims);
    }

    private AppTenantInfo GetValidatedTenant()
    {
        var tenant = _multiTenantContextAccessor!.MultiTenantContext.TenantInfo
            ?? throw new UnauthorizedException();

        if (string.IsNullOrWhiteSpace(tenant.Id))
        {
            throw new UnauthorizedException();
        }

        return tenant;
    }

    private async Task<FshUser> FindAndValidateUserByCredentialsAsync(string email, string password)
    {
        var user = await _userManager.FindByEmailAsync(email.Trim().Normalize());
        if (user is null)
        {
            // Generic 401 — never confirm or deny account existence from this path.
            throw new UnauthorizedException();
        }

        // Lockout check runs BEFORE password check so an attacker can't tell a locked
        // account from a wrong-password one on every request.
        if (_userManager.SupportsUserLockout && await _userManager.IsLockedOutAsync(user))
        {
            _logger.LogWarning("Login attempted for locked account {UserId}", user.Id);
            throw new CustomException(
                "Account is temporarily locked due to too many failed login attempts. Try again later.",
                errors: null,
                HttpStatusCode.Locked);
        }

        if (!await _userManager.CheckPasswordAsync(user, password))
        {
            if (_userManager.SupportsUserLockout)
            {
                await _userManager.AccessFailedAsync(user);
                if (await _userManager.IsLockedOutAsync(user))
                {
                    _logger.LogWarning(
                        "Account {UserId} locked out after exceeding failed login threshold.",
                        user.Id);
                }
            }
            throw new UnauthorizedException();
        }

        // Successful authentication resets the failed-attempt counter.
        if (_userManager.SupportsUserLockout && await _userManager.GetAccessFailedCountAsync(user) > 0)
        {
            await _userManager.ResetAccessFailedCountAsync(user);
        }

        return user;
    }

    /// <summary>
    /// Resolves the user owning a refresh token. The per-user column only holds the LAST issued token, so
    /// a second device signing in (or a concurrent refresh) would otherwise invalidate the first device's
    /// token and log it out. Sessions track their own current token, so they are consulted when the column
    /// does not match. Rotation is strict: a session's previous (rotated) token is never accepted.
    /// </summary>
    private async Task<(FshUser User, DateTime ExpiresAtUtc)> FindUserByRefreshTokenAsync(string refreshToken, string tenantId, CancellationToken ct)
    {
        var hashedToken = HashToken(refreshToken);

        if (_logger.IsEnabled(LogLevel.Debug))
        {
            _logger.LogDebug(
                "Validating refresh token for tenant {TenantId}. Token hash: {TokenHash}",
                tenantId, hashedToken[..Math.Min(8, hashedToken.Length)]);
        }

        var user = await _userManager.Users
            .FirstOrDefaultAsync(u => u.RefreshToken == hashedToken, ct);

        if (user is not null)
        {
            return (user, user.RefreshTokenExpiryTime);
        }

        var sessionHash = SessionTokenHash(refreshToken);
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var session = await _dbContext.UserSessions
            .AsNoTracking()
            .Where(s => !s.IsRevoked
                && s.ExpiresAt > now
                && s.RefreshTokenHash == sessionHash)
            .OrderByDescending(s => s.LastActivityAt)
            .FirstOrDefaultAsync(ct)
            .ConfigureAwait(false);

        if (session is not null)
        {
            user = await _userManager.Users
                .FirstOrDefaultAsync(u => u.Id == session.UserId, ct)
                .ConfigureAwait(false);
            if (user is not null)
            {
                return (user, session.ExpiresAt);
            }
        }

        _logger.LogWarning("No user found with matching refresh token hash for tenant {TenantId}", tenantId);
        throw new UnauthorizedException("refresh token is invalid or expired");
    }

    private void ValidateRefreshTokenExpiry(FshUser user, DateTime expiresAtUtc)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        if (expiresAtUtc <= now)
        {
            _logger.LogWarning(
                "Refresh token expired for user {UserId}. Expired at: {ExpiryTime}, Current time: {CurrentTime}",
                user.Id, expiresAtUtc, now);
            throw new UnauthorizedException("refresh token is invalid or expired");
        }
    }

    /// <summary>Same short fingerprint the session rows store (see RefreshTokenCommandHandler.Sha256Short).</summary>
    private static string SessionTokenHash(string token)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(hash.AsSpan(0, 8));
    }

    private static void ValidateUserStatus(FshUser user)
    {
        if (!user.IsActive)
        {
            throw new UnauthorizedException("user is deactivated");
        }

        if (!user.EmailConfirmed)
        {
            throw new UnauthorizedException("email not confirmed");
        }
    }

    private void ValidateTenantStatus(AppTenantInfo tenant)
    {
        if (tenant.Id == MultitenancyConstants.Root.Id)
        {
            return;
        }

        if (!tenant.IsActive)
        {
            throw new UnauthorizedException($"tenant {tenant.Id} is deactivated");
        }

        // Honor the billing grace period: a lapsed tenant can still authenticate until
        // ValidUpto + grace (matching the request-time guard in MultitenancyModule).
        if (_timeProvider.GetUtcNow().UtcDateTime > tenant.ValidUpto.AddDays(_gracePeriodDays))
        {
            throw new UnauthorizedException($"tenant {tenant.Id} validity has expired");
        }
    }

    private async Task<List<Claim>> BuildUserClaimsAsync(FshUser user, string tenantId, CancellationToken ct)
    {
        var claims = CreateBasicClaims(user, tenantId);
        await AddRoleClaimsAsync(claims, user, ct);
        return claims;
    }

    private static List<Claim> CreateBasicClaims(FshUser user, string tenantId)
    {
        var fullName = $"{user.FirstName} {user.LastName}".Trim();
        return
        [
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            // RFC 7519 short-form sub/name/email emitted alongside legacy ClaimTypes.* so JWT consumers read them per spec.
            // `name` is published explicitly because the default outbound map turns ClaimTypes.Name into `unique_name`, not `name`.
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.Name, fullName.Length > 0 ? fullName : (user.Email ?? string.Empty)),
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Email, user.Email!),
            new(ClaimTypes.Name, user.FirstName ?? string.Empty),
            new(ClaimTypes.MobilePhone, user.PhoneNumber ?? string.Empty),
            new(ClaimConstants.Fullname, fullName),
            new(ClaimTypes.Surname, user.LastName ?? string.Empty),
            new(ClaimConstants.Tenant, tenantId),
            new(ClaimConstants.ImageUrl, user.ImageUrl?.ToString() ?? string.Empty)
        ];
    }

    private async Task AddRoleClaimsAsync(List<Claim> claims, FshUser user, CancellationToken ct)
    {
        var directRoles = await _userManager.GetRolesAsync(user);
        var groupRoles = await _groupRoleService.GetUserGroupRolesAsync(user.Id, ct);

        var allRoles = directRoles.Union(groupRoles).Distinct();
        claims.AddRange(allRoles.Select(r => new Claim(ClaimTypes.Role, r)));

        await AddPermissionClaimsAsync(claims, user.Id, ct);
    }

    // Effective permissions (direct + group roles) from the shared, cached UserPermissionService
    // so the frontend can gate UI without a round trip. Server-side checks are unchanged.
    private async Task AddPermissionClaimsAsync(List<Claim> claims, string userId, CancellationToken ct)
    {
        var permissions = await _userPermissionService.GetPermissionsAsync(userId, ct).ConfigureAwait(false);
        if (permissions is not null)
        {
            claims.AddRange(TokenPermissionAllowlist.Filter(permissions).Select(p => new Claim(ClaimConstants.Permission, p)));
        }
    }

    private static string HashToken(string token)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(token);
        var hash = System.Security.Cryptography.SHA256.HashData(bytes);
        return Convert.ToBase64String(hash);
    }
}