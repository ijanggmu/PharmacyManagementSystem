using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.Tokens.RevokeRefreshToken;

/// <summary>
/// Sign-out: revokes the session that owns <paramref name="RefreshToken"/> and clears it from the user so
/// it can never be refreshed again. Possession of the refresh token is the proof; the call is idempotent
/// and always succeeds (no oracle for whether the token was valid).
/// </summary>
public sealed record RevokeRefreshTokenCommand(string RefreshToken) : ICommand<Unit>;
