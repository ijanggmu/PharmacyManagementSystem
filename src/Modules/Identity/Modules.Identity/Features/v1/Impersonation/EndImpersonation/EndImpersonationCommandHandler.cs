using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Impersonation.EndImpersonation;
using Mediator;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;

namespace FSH.Modules.Identity.Features.v1.Impersonation.EndImpersonation;

public sealed class EndImpersonationCommandHandler
    : ICommandHandler<EndImpersonationCommand, TokenResponse>
{
    private readonly IIdentityService _identityService;
    private readonly ITokenService _tokenService;
    private readonly ISecurityAudit _securityAudit;
    private readonly ICurrentUser _currentUser;
    private readonly IRequestContext _requestContext;
    private readonly IImpersonationGrantService _grantService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EndImpersonationCommandHandler> _logger;

    public EndImpersonationCommandHandler(
        IIdentityService identityService,
        ITokenService tokenService,
        ISecurityAudit securityAudit,
        ICurrentUser currentUser,
        IRequestContext requestContext,
        IImpersonationGrantService grantService,
        IServiceScopeFactory scopeFactory,
        ILogger<EndImpersonationCommandHandler> logger)
    {
        _identityService = identityService;
        _tokenService = tokenService;
        _securityAudit = securityAudit;
        _currentUser = currentUser;
        _requestContext = requestContext;
        _grantService = grantService;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async ValueTask<TokenResponse> Handle(
        EndImpersonationCommand request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!_currentUser.IsAuthenticated())
        {
            throw new UnauthorizedException();
        }

        var claims = _currentUser.GetUserClaims()?.ToList()
            ?? throw new UnauthorizedException();

        var actorUserId = claims.FirstOrDefault(c => c.Type == ClaimConstants.ActorSubject)?.Value;
        var actorTenantId = claims.FirstOrDefault(c => c.Type == ClaimConstants.ActorTenant)?.Value;
        var jti = claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti)?.Value;

        if (string.IsNullOrWhiteSpace(actorUserId) || string.IsNullOrWhiteSpace(actorTenantId))
        {
            // Signed in but no act_sub claim (End called on a non-impersonation token): client error,
            // must be 4xx not CustomException's default 500.
            throw new CustomException(
                "current session is not an impersonation session",
                errors: null,
                System.Net.HttpStatusCode.BadRequest);
        }

        var impersonatedUserId = _currentUser.GetUserId().ToString();
        var impersonatedTenantId = _currentUser.GetTenant() ?? string.Empty;

        // Mark grant ended BEFORE issuing actor tokens so a racing JWT-hook request sees "ended" (safer than the reverse).
        // If MarkEnded fails we proceed anyway: the grant expires naturally and the hook treats Unknown states as revoked.
        if (!string.IsNullOrWhiteSpace(jti))
        {
            try
            {
                await _grantService.MarkEndedByJtiAsync(jti, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to mark impersonation grant ended for jti={Jti}. Actor swap will still proceed.",
                    jti);
            }
        }

        var actorClaimsResult = await _identityService
            .BuildClaimsForUserAsync(actorUserId, actorTenantId, cancellationToken);

        if (actorClaimsResult is null)
        {
            throw new NotFoundException("original actor not found");
        }

        var (subject, actorClaims) = actorClaimsResult.Value;

        var token = await _tokenService.IssueAsync(subject, actorClaims, actorTenantId, cancellationToken);
        await _identityService.StoreRefreshTokenAsync(subject, token.RefreshToken, token.RefreshTokenExpiresAt, cancellationToken).ConfigureAwait(false);

        // The restored actor token must have a session row (refresh rejects session-less tokens), and that row
        // must live in the ACTOR's tenant — this request runs in the impersonated tenant's context.
        await CreateActorSessionAsync(subject, actorTenantId, token, cancellationToken).ConfigureAwait(false);

        await _securityAudit.ImpersonationEndedAsync(
            actorUserId: actorUserId,
            actorTenantId: actorTenantId,
            targetUserId: impersonatedUserId,
            targetTenantId: impersonatedTenantId,
            clientId: _requestContext.ClientId ?? "unknown",
            ct: cancellationToken);

        if (_logger.IsEnabled(LogLevel.Information))
        {
            _logger.LogInformation(
                "Impersonation ended: actor {ActorUserId}@{ActorTenant} returned from {TargetUserId}@{TargetTenant} jti={Jti}",
                actorUserId, actorTenantId, impersonatedUserId, impersonatedTenantId, jti ?? "<missing>");
        }

        return token;
    }

    private async Task CreateActorSessionAsync(string actorUserId, string actorTenantId, TokenResponse token, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>();
        var tenant = await store.GetAsync(actorTenantId).ConfigureAwait(false)
            ?? throw new NotFoundException("original actor tenant not found");

        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var sessionService = scope.ServiceProvider.GetRequiredService<ISessionService>();
        await sessionService.CreateSessionAsync(
            actorUserId,
            SessionTokenHash(token.RefreshToken),
            _requestContext.IpAddress ?? "unknown",
            _requestContext.UserAgent ?? "unknown",
            token.RefreshTokenExpiresAt,
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Same short fingerprint session rows store (see RefreshTokenCommandHandler).</summary>
    private static string SessionTokenHash(string value)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(hash.AsSpan(0, 8));
    }
}
