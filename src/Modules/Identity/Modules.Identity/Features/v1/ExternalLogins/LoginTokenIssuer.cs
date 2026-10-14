using System.Security.Claims;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Outbox;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Authorization.Jwt;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Events;
using FSH.Modules.Identity.Contracts.Services;

namespace FSH.Modules.Identity.Features.v1.ExternalLogins;

/// <summary>
/// The post-authentication half of a login, identical to the password path in
/// <c>GenerateTokenCommandHandler</c>: audit, issue tokens, store the hashed refresh token, write the session
/// row and enqueue <see cref="TokenGeneratedIntegrationEvent"/>.
/// </summary>
public sealed class LoginTokenIssuer(
    IIdentityService identityService,
    ITokenService tokenService,
    ISecurityAudit securityAudit,
    IRequestContext requestContext,
    IOutboxStore outboxStore,
    IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
    ISessionService sessionService)
{
    public async Task<TokenResponse> IssueAsync(string subject, IEnumerable<Claim> claims, string loginName, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subject);
        ArgumentNullException.ThrowIfNull(claims);

        var claimList = claims.ToList();
        string ip = requestContext.IpAddress ?? "unknown";
        string ua = requestContext.UserAgent ?? "unknown";
        string clientId = requestContext.ClientId ?? "unknown";
        string userName = claimList.FirstOrDefault(c => c.Type == ClaimTypes.Name)?.Value ?? loginName;

        await securityAudit.LoginSucceededAsync(subject, userName, clientId, ip, ua, ct).ConfigureAwait(false);

        // The access token carries its session's id (sid) so revoking the session stops it too.
        var sessionId = Guid.NewGuid();
        var token = await tokenService.IssueAsync(subject, SessionClaims.WithSessionId(claimList, sessionId), null, ct).ConfigureAwait(false);
        await identityService.StoreRefreshTokenAsync(subject, token.RefreshToken, token.RefreshTokenExpiresAt, ct).ConfigureAwait(false);

        // Required, not best-effort: refresh rejects tokens without a session row.
        await sessionService.CreateSessionAsync(sessionId, subject, Fingerprint(token.RefreshToken), ip, ua, token.RefreshTokenExpiresAt, ct)
            .ConfigureAwait(false);

        string fingerprint = Fingerprint(token.AccessToken);
        await securityAudit.TokenIssuedAsync(subject, userName, clientId, fingerprint, token.AccessTokenExpiresAt, ct).ConfigureAwait(false);

        await outboxStore.AddAsync(new TokenGeneratedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: TimeProvider.System.GetUtcNow().UtcDateTime,
            TenantId: multiTenantContextAccessor.MultiTenantContext?.TenantInfo?.Id,
            CorrelationId: Guid.NewGuid().ToString(),
            Source: "Identity",
            UserId: subject,
            Email: loginName,
            ClientId: clientId,
            IpAddress: ip,
            UserAgent: ua,
            TokenFingerprint: fingerprint,
            AccessTokenExpiresAtUtc: token.AccessTokenExpiresAt), ct).ConfigureAwait(false);

        return token;
    }

    private static string Fingerprint(string value)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(hash.AsSpan(0, 8));
    }
}
