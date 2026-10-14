using System.Net;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Authorization.Jwt;
using FSH.Framework.Eventing.Outbox;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Events;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Tokens.TokenGeneration;
using Mediator;
using System.Security.Claims;

namespace FSH.Modules.Identity.Features.v1.Tokens.TokenGeneration;

public sealed class GenerateTokenCommandHandler
    : ICommandHandler<GenerateTokenCommand, TokenResponse>
{
    private readonly IIdentityService _identityService;
    private readonly ITokenService _tokenService;
    private readonly ISecurityAudit _securityAudit;
    private readonly IRequestContext _requestContext;
    private readonly IOutboxStore _outboxStore;
    private readonly IMultiTenantContextAccessor<AppTenantInfo> _multiTenantContextAccessor;
    private readonly ISessionService _sessionService;

    public GenerateTokenCommandHandler(
        IIdentityService identityService,
        ITokenService tokenService,
        ISecurityAudit securityAudit,
        IRequestContext requestContext,
        IOutboxStore outboxStore,
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        ISessionService sessionService)
    {
        _identityService = identityService;
        _tokenService = tokenService;
        _securityAudit = securityAudit;
        _requestContext = requestContext;
        _outboxStore = outboxStore;
        _multiTenantContextAccessor = multiTenantContextAccessor;
        _sessionService = sessionService;
    }

    public async ValueTask<TokenResponse> Handle(
        GenerateTokenCommand request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Gather context for auditing
        var ip = _requestContext.IpAddress ?? "unknown";
        var ua = _requestContext.UserAgent ?? "unknown";
        var clientId = _requestContext.ClientId;

        // Validate credentials (includes 2FA verification when the user has it enabled). Rejections are thrown
        // (401 wrong password / unknown user / bad 2FA code, 423 locked out), so audit them on the way out.
        (string Subject, IEnumerable<Claim> Claims)? identityResult;
        try
        {
            identityResult = await _identityService
                .ValidateCredentialsAsync(request.Email, request.Password, request.TwoFactorCode, request.RecoveryCode, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex) when (LoginFailureReason(ex) is string reason)
        {
            await _securityAudit.LoginFailedAsync(
                subjectIdOrName: request.Email,
                clientId: clientId!,
                reason: reason,
                ip: ip,
                ct: cancellationToken).ConfigureAwait(false);
            throw;
        }

        if (identityResult is null)
        {
            // 1) Audit failed login BEFORE throwing
            await _securityAudit.LoginFailedAsync(
                subjectIdOrName: request.Email,
                clientId: clientId!,
                reason: "InvalidCredentials",
                ip: ip,
                ct: cancellationToken);

            throw new UnauthorizedAccessException("Invalid credentials.");
        }

        // Unpack subject + claims
        var (subject, claims) = identityResult.Value;

        // 2) Audit successful login
        await _securityAudit.LoginSucceededAsync(
            userId: subject,
            userName: claims.FirstOrDefault(c => c.Type == ClaimTypes.Name)?.Value ?? request.Email,
            clientId: clientId!,
            ip: ip,
            userAgent: ua,
            ct: cancellationToken);

        // Issue token, tied to the session row created below (sid) so revoking the session stops it too
        var sessionId = Guid.NewGuid();
        claims = SessionClaims.WithSessionId(claims, sessionId);
        var token = await _tokenService.IssueAsync(subject, claims, /*extra*/ null, cancellationToken);

        // Persist refresh token (hashed) for this user
        await _identityService.StoreRefreshTokenAsync(subject, token.RefreshToken, token.RefreshTokenExpiresAt, cancellationToken);

        // Create the user session. Required: refresh only accepts tokens that belong to a session row (so every
        // refresh token can be revoked), so a failure here must fail the login rather than hand out a token
        // that would be rejected on its first refresh.
        var refreshTokenHash = Sha256Short(token.RefreshToken);
        await _sessionService.CreateSessionAsync(
            sessionId,
            subject,
            refreshTokenHash,
            ip,
            ua,
            token.RefreshTokenExpiresAt,
            cancellationToken).ConfigureAwait(false);

        // 3) Audit token issuance with a fingerprint (never raw token)
        var fingerprint = Sha256Short(token.AccessToken);
        await _securityAudit.TokenIssuedAsync(
            userId: subject,
            userName: claims.FirstOrDefault(c => c.Type == ClaimTypes.Name)?.Value ?? request.Email,
            clientId: clientId!,
            tokenFingerprint: fingerprint,
            expiresUtc: token.AccessTokenExpiresAt,
            ct: cancellationToken);

        // 4) Enqueue integration event for token generation (sample event for testing eventing)
        var tenantId = _multiTenantContextAccessor.MultiTenantContext?.TenantInfo?.Id;
        var correlationId = Guid.NewGuid().ToString();

        var integrationEvent = new TokenGeneratedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: TimeProvider.System.GetUtcNow().UtcDateTime,
            TenantId: tenantId,
            CorrelationId: correlationId,
            Source: "Identity",
            UserId: subject,
            Email: request.Email,
            ClientId: clientId!,
            IpAddress: ip,
            UserAgent: ua,
            TokenFingerprint: fingerprint,
            AccessTokenExpiresAtUtc: token.AccessTokenExpiresAt);

        await _outboxStore.AddAsync(integrationEvent, cancellationToken).ConfigureAwait(false);

        return token;
    }

    /// <summary>The audit reason for a rejected sign-in, or null for exceptions that aren't a refused login
    /// (a 2FA prompt is a step of the flow, not a failure).</summary>
    internal static string? LoginFailureReason(Exception ex) => ex switch
    {
        UnauthorizedException u when u.Message.StartsWith("two_factor_invalid", StringComparison.Ordinal) => "InvalidTwoFactorCode",
        UnauthorizedException u when u.Message.Contains("deactivated", StringComparison.OrdinalIgnoreCase) => "UserDeactivated",
        UnauthorizedException u when u.Message.Contains("email not confirmed", StringComparison.OrdinalIgnoreCase) => "EmailNotConfirmed",
        UnauthorizedException u when u.Message.Contains("validity has expired", StringComparison.OrdinalIgnoreCase) => "TenantExpired",
        UnauthorizedException => "InvalidCredentials",
        UnauthorizedAccessException => "InvalidCredentials",
        CustomException { StatusCode: HttpStatusCode.Locked } => "AccountLocked",
        _ => null,
    };

    private static string Sha256Short(string value)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value));
        // short printable fingerprint; store only this
        return Convert.ToHexString(hash.AsSpan(0, 8));
    }
}