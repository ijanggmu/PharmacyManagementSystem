using FSH.Modules.Auditing.Contracts;

namespace FSH.Modules.Auditing;

/// <summary>
/// Typed security events. Each event names the user it is about on the envelope (<c>UserId</c> / <c>UserName</c>)
/// as well as in the payload's <c>subjectId</c>, so the security audit search by user finds logins, tokens, role
/// changes and password changes. A failed login only knows the login name typed, so it carries that as the
/// user name and leaves the user id empty.
/// </summary>
public sealed class SecurityAudit : ISecurityAudit
{
    private const string Source = "Identity";

    public ValueTask LoginSucceededAsync(string userId, string userName, string clientId, string ip, string userAgent, CancellationToken ct = default)
        => Write(SecurityAction.LoginSucceeded, userId, userName,
            new SecurityContext(userId, clientId, "Password", ""),
            new Dictionary<string, object?> { ["ip"] = ip, ["userAgent"] = userAgent },
            AuditSeverity.Information, ct);

    public ValueTask LoginFailedAsync(string subjectIdOrName, string clientId, string reason, string ip, CancellationToken ct = default)
        => Write(SecurityAction.LoginFailed, userId: null, userName: subjectIdOrName,
            new SecurityContext(subjectIdOrName, clientId, "Password", reason),
            new Dictionary<string, object?> { ["ip"] = ip },
            AuditSeverity.Warning, ct);

    public ValueTask TokenIssuedAsync(string userId, string userName, string clientId, string tokenFingerprint, DateTime expiresUtc, CancellationToken ct = default)
        => Write(SecurityAction.TokenIssued, userId, userName,
            new SecurityContext(userId, clientId, "Password", ""),
            new Dictionary<string, object?> { ["fingerprint"] = tokenFingerprint, ["expiresAt"] = expiresUtc },
            AuditSeverity.Information, ct);

    public ValueTask TokenRevokedAsync(string userId, string clientId, string reason, CancellationToken ct = default)
        => Write(SecurityAction.TokenRevoked, KnownUserId(userId), userName: null,
            new SecurityContext(userId, clientId, "", reason),
            claims: null,
            AuditSeverity.Information, ct);

    public ValueTask ImpersonationStartedAsync(string actorUserId, string actorTenantId, string targetUserId, string targetTenantId, string clientId, string ip, string userAgent, string reason, CancellationToken ct = default)
        => Write(SecurityAction.ImpersonationStarted, actorUserId, userName: null,
            new SecurityContext(actorUserId, clientId, "Impersonation", reason),
            new Dictionary<string, object?>
            {
                ["actorTenant"] = actorTenantId,
                ["targetUser"] = targetUserId,
                ["targetTenant"] = targetTenantId,
                ["ip"] = ip,
                ["userAgent"] = userAgent
            },
            AuditSeverity.Warning, ct);

    public ValueTask ImpersonationEndedAsync(string actorUserId, string actorTenantId, string targetUserId, string targetTenantId, string clientId, CancellationToken ct = default)
        => Write(SecurityAction.ImpersonationEnded, actorUserId, userName: null,
            new SecurityContext(actorUserId, clientId, "Impersonation", ""),
            new Dictionary<string, object?>
            {
                ["actorTenant"] = actorTenantId,
                ["targetUser"] = targetUserId,
                ["targetTenant"] = targetTenantId
            },
            AuditSeverity.Information, ct);

    public ValueTask RoleAssignedAsync(string userId, string? userName, string roleName, string? actorUserId, CancellationToken ct = default)
        => Write(SecurityAction.RoleAssigned, userId, userName,
            new SecurityContext(userId, null, "", roleName),
            new Dictionary<string, object?> { ["role"] = roleName, ["actorId"] = actorUserId },
            AuditSeverity.Warning, ct);

    public ValueTask RoleRevokedAsync(string userId, string? userName, string roleName, string? actorUserId, CancellationToken ct = default)
        => Write(SecurityAction.RoleRevoked, userId, userName,
            new SecurityContext(userId, null, "", roleName),
            new Dictionary<string, object?> { ["role"] = roleName, ["actorId"] = actorUserId },
            AuditSeverity.Warning, ct);

    public ValueTask PasswordChangedAsync(string userId, string? userName, bool wasReset, CancellationToken ct = default)
        => Write(SecurityAction.PasswordChanged, userId, userName,
            new SecurityContext(userId, null, "Password", wasReset ? "PasswordReset" : "PasswordChanged"),
            claims: null,
            AuditSeverity.Information, ct);

    private static ValueTask Write(
        SecurityAction action,
        string? userId,
        string? userName,
        SecurityContext context,
        IReadOnlyDictionary<string, object?>? claims,
        AuditSeverity severity,
        CancellationToken ct)
        => Audit.ForSecurity(action)
            .WithSecurityContext(context.SubjectId, context.ClientId, context.AuthMethod, context.ReasonCode, claims)
            .WithUser(string.IsNullOrWhiteSpace(userId) ? null : userId, string.IsNullOrWhiteSpace(userName) ? null : userName)
            .WithSource(Source)
            .WithSeverity(severity)
            .WriteAsync(ct);

    // Refresh failures pass "unknown" when the token can't be tied to a user.
    private static string? KnownUserId(string? userId)
        => string.IsNullOrWhiteSpace(userId) || string.Equals(userId, "unknown", StringComparison.OrdinalIgnoreCase) ? null : userId;

    private readonly record struct SecurityContext(string? SubjectId, string? ClientId, string? AuthMethod, string? ReasonCode);
}
