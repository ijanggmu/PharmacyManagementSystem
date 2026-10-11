using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace FSH.Modules.Identity.Services.Google;

/// <summary>
/// Validates a Google Identity Services ID token: RS256 signature against Google's published keys, issuer
/// (<c>accounts.google.com</c> with or without the scheme), audience in the configured client ids, and
/// lifetime (5-minute clock skew). The raw token is never logged.
/// </summary>
public sealed partial class GoogleIdTokenValidator(
    IOptions<GoogleAuthOptions> options,
    IGoogleSigningKeyProvider signingKeys,
    TimeProvider timeProvider,
    ILogger<GoogleIdTokenValidator> logger) : IGoogleIdTokenValidator
{
    private static readonly string[] GoogleIssuers = ["accounts.google.com", "https://accounts.google.com"];

    private readonly JsonWebTokenHandler _handler = new();

    public bool IsEnabled => options.Value.ClientIds.Any(id => !string.IsNullOrWhiteSpace(id));

    public async Task<GoogleIdentity> ValidateAsync(string idToken, CancellationToken ct = default)
    {
        if (!IsEnabled)
        {
            throw new NotFoundException("Google sign-in is not configured.");
        }

        if (string.IsNullOrWhiteSpace(idToken))
        {
            throw new UnauthorizedException("google_token_invalid: The Google sign-in token is missing.");
        }

        var keys = await signingKeys.GetSigningKeysAsync(ct).ConfigureAwait(false);
        var parameters = new TokenValidationParameters
        {
            ValidIssuers = GoogleIssuers,
            ValidAudiences = options.Value.ClientIds.Where(id => !string.IsNullOrWhiteSpace(id)).ToArray(),
            IssuerSigningKeys = keys,
            ValidateIssuerSigningKey = true,
            RequireSignedTokens = true,
            RequireExpirationTime = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(5),
            LifetimeValidator = (notBefore, expires, _, p) =>
            {
                var now = timeProvider.GetUtcNow().UtcDateTime;
                return expires is { } exp && exp.Add(p.ClockSkew) >= now
                    && (notBefore is not { } nbf || nbf.Subtract(p.ClockSkew) <= now);
            },
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
        };

        var result = await _handler.ValidateTokenAsync(idToken, parameters).ConfigureAwait(false);
        if (!result.IsValid || result.SecurityToken is not JsonWebToken jwt)
        {
            LogInvalidToken(logger, result.Exception?.GetType().Name ?? "unknown");
            throw new UnauthorizedException("google_token_invalid: The Google sign-in could not be verified. Please try again.");
        }

        string subject = jwt.Subject;
        string? email = Claim(jwt, "email");
        if (string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(email))
        {
            throw new UnauthorizedException("google_token_invalid: The Google account did not share an email address.");
        }

        return new GoogleIdentity(
            Subject: subject,
            Email: email.Trim(),
            EmailVerified: IsTrue(Claim(jwt, "email_verified")),
            GivenName: Claim(jwt, "given_name"),
            FamilyName: Claim(jwt, "family_name"),
            Name: Claim(jwt, "name"),
            Picture: Claim(jwt, "picture"));
    }

    private static string? Claim(JsonWebToken jwt, string type) =>
        jwt.TryGetPayloadValue<object>(type, out var value) ? value?.ToString() : null;

    private static bool IsTrue(string? value) => string.Equals(value, "true", StringComparison.OrdinalIgnoreCase);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Rejected a Google ID token ({Reason})")]
    private static partial void LogInvalidToken(ILogger logger, string reason);
}
