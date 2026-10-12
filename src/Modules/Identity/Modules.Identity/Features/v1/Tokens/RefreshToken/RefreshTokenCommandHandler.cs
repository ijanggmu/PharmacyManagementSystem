using FSH.Framework.Core.Context;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.v1.Tokens.RefreshToken;
using Mediator;
using Microsoft.Extensions.Logging;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace FSH.Modules.Identity.Features.v1.Tokens.RefreshToken;

public sealed class RefreshTokenCommandHandler
    : ICommandHandler<RefreshTokenCommand, RefreshTokenCommandResponse>
{
    private readonly IIdentityService _identityService;
    private readonly ITokenService _tokenService;
    private readonly ISecurityAudit _securityAudit;
    private readonly IRequestContext _requestContext;
    private readonly ISessionService _sessionService;
    private readonly ILogger<RefreshTokenCommandHandler> _logger;

    public RefreshTokenCommandHandler(
        IIdentityService identityService,
        ITokenService tokenService,
        ISecurityAudit securityAudit,
        IRequestContext requestContext,
        ISessionService sessionService,
        ILogger<RefreshTokenCommandHandler> logger)
    {
        _identityService = identityService;
        _tokenService = tokenService;
        _securityAudit = securityAudit;
        _requestContext = requestContext;
        _sessionService = sessionService;
        _logger = logger;
    }

    public async ValueTask<RefreshTokenCommandResponse> Handle(
        RefreshTokenCommand request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var clientId = _requestContext.ClientId;
        var refreshTokenHash = Sha256Short(request.RefreshToken);

        // Reuse detection: a token that was already rotated is being replayed. Revoke the session it came
        // from so neither the replayer nor the holder of the current token can keep refreshing.
        if (await _sessionService.RevokeSessionOnRefreshTokenReuseAsync(refreshTokenHash, cancellationToken).ConfigureAwait(false))
        {
            await _securityAudit.TokenRevokedAsync("unknown", clientId!, "RefreshTokenReuseDetected", cancellationToken).ConfigureAwait(false);
            throw new UnauthorizedException("Refresh token has already been used.");
        }

        // Validate refresh token and rebuild subject + claims
        var validated = await _identityService
            .ValidateRefreshTokenAsync(request.RefreshToken, cancellationToken).ConfigureAwait(false);

        if (validated is null)
        {
            await _securityAudit.TokenRevokedAsync("unknown", clientId!, "InvalidRefreshToken", cancellationToken).ConfigureAwait(false);
            throw new UnauthorizedException("Invalid refresh token.");
        }

        var (subject, claims) = validated.Value;

        // The token must belong to a live session (tokens without a session row can't be revoked).
        var isSessionValid = await _sessionService.ValidateSessionAsync(refreshTokenHash, cancellationToken).ConfigureAwait(false);
        if (!isSessionValid)
        {
            await _securityAudit.TokenRevokedAsync(subject, clientId!, "SessionRevoked", cancellationToken).ConfigureAwait(false);
            throw new UnauthorizedException("Session has been revoked.");
        }

        // Optionally, cross-check the provided access token subject
        var handler = new JwtSecurityTokenHandler();
        JwtSecurityToken? parsedAccessToken = null;
        try
        {
            parsedAccessToken = handler.ReadJwtToken(request.Token);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to parse access token during refresh; relying on refresh-token validation only");
        }

        if (parsedAccessToken is not null)
        {
            var accessTokenSubject = parsedAccessToken.Claims
                .FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value
                ?? parsedAccessToken.Subject;

            if (!string.IsNullOrEmpty(accessTokenSubject) &&
                !string.Equals(accessTokenSubject, subject, StringComparison.Ordinal))
            {
                await _securityAudit.TokenRevokedAsync(subject, clientId!, "RefreshTokenSubjectMismatch", cancellationToken).ConfigureAwait(false);
                throw new UnauthorizedException("Access token subject mismatch.");
            }
        }

        // Issue new tokens (not handed out until the rotation below wins)
        var newToken = await _tokenService.IssueAsync(subject, claims, null, cancellationToken).ConfigureAwait(false);

        // Atomic rotation: only the request whose conditional UPDATE swaps the session's current hash may
        // return tokens. A concurrent refresh of the same token loses here and gets 401 instead of minting a
        // second, session-less (and therefore unrevocable) refresh token.
        var newRefreshTokenHash = Sha256Short(newToken.RefreshToken);
        var rotated = await _sessionService.UpdateSessionRefreshTokenAsync(
            refreshTokenHash,
            newRefreshTokenHash,
            newToken.RefreshTokenExpiresAt,
            cancellationToken).ConfigureAwait(false);
        if (!rotated)
        {
            await _securityAudit.TokenRevokedAsync(subject, clientId!, "RefreshTokenRotationLost", cancellationToken).ConfigureAwait(false);
            throw new UnauthorizedException("Refresh token has already been used.");
        }

        // Audit previous token revocation by rotation (no raw tokens)
        await _securityAudit.TokenRevokedAsync(subject, clientId!, "RefreshTokenRotated", cancellationToken).ConfigureAwait(false);

        // Persist rotated refresh token for this user (legacy per-user column; the session row is authoritative)
        await _identityService.StoreRefreshTokenAsync(subject, newToken.RefreshToken, newToken.RefreshTokenExpiresAt, cancellationToken).ConfigureAwait(false);

        // Audit the newly issued token with a fingerprint
        var fingerprint = Sha256Short(newToken.AccessToken);
        await _securityAudit.TokenIssuedAsync(
            userId: subject,
            userName: claims.FirstOrDefault(c => c.Type == ClaimTypes.Name)?.Value ?? string.Empty,
            clientId: clientId!,
            tokenFingerprint: fingerprint,
            expiresUtc: newToken.AccessTokenExpiresAt,
            ct: cancellationToken);

        return new RefreshTokenCommandResponse(
            Token: newToken.AccessToken,
            RefreshToken: newToken.RefreshToken,
            RefreshTokenExpiryTime: newToken.RefreshTokenExpiresAt);
    }

    private static string Sha256Short(string value)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(hash.AsSpan(0, 8));
    }
}