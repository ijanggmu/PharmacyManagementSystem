using Auditing.Tests.Http;
using FSH.Modules.Auditing;
using FSH.Modules.Auditing.Contracts;

namespace Auditing.Tests.Contracts;

/// <summary>
/// Security events carry the user they are about on the envelope, so the security audit search by user finds
/// logins, issued tokens, role changes and password changes. Uses the static <see cref="Audit"/> publisher.
/// </summary>
[Collection(StaticAuditPublisherGroup.Name)]
public sealed class SecurityAuditTests
{
    private sealed class RecordingPublisher : IAuditPublisher
    {
        public List<IAuditEvent> Events { get; } = [];

        public IAuditScope CurrentScope { get; } =
            new DefaultAuditScope(null, null, null, null, null, null, null, null, AuditTag.None);

        public ValueTask PublishAsync(IAuditEvent auditEvent, CancellationToken ct = default)
        {
            Events.Add(auditEvent);
            return ValueTask.CompletedTask;
        }
    }

    private static async Task<IAuditEvent> WriteAsync(Func<SecurityAudit, ValueTask> write)
    {
        var publisher = new RecordingPublisher();
        Audit.Configure(publisher);
        await write(new SecurityAudit());
        return publisher.Events.ShouldHaveSingleItem();
    }

    private static SecurityEventPayload Payload(IAuditEvent e) => e.Payload.ShouldBeOfType<SecurityEventPayload>();

    [Fact]
    public async Task LoginSucceeded_And_TokenIssued_Should_Name_The_User()
    {
        var login = await WriteAsync(a => a.LoginSucceededAsync("user-1", "Sita Sharma", "web", "10.0.0.1", "UA"));
        var token = await WriteAsync(a => a.TokenIssuedAsync("user-1", "Sita Sharma", "web", "ABCD", DateTime.UtcNow));

        login.UserId.ShouldBe("user-1");
        login.UserName.ShouldBe("Sita Sharma");
        Payload(login).Action.ShouldBe(SecurityAction.LoginSucceeded);
        token.UserId.ShouldBe("user-1");
    }

    [Fact]
    public async Task LoginFailed_Should_Carry_The_LoginName_But_No_UserId()
    {
        var e = await WriteAsync(a => a.LoginFailedAsync("someone@pharmacy.test", "web", "InvalidCredentials", "10.0.0.1"));

        e.UserId.ShouldBeNull();
        e.UserName.ShouldBe("someone@pharmacy.test");
        e.Severity.ShouldBe(AuditSeverity.Warning);
        Payload(e).ReasonCode.ShouldBe("InvalidCredentials");
    }

    [Fact]
    public async Task RoleAssigned_RoleRevoked_And_PasswordChanged_Should_Be_Written()
    {
        var assigned = await WriteAsync(a => a.RoleAssignedAsync("user-2", "cashier", "Manager", "admin-1"));
        var revoked = await WriteAsync(a => a.RoleRevokedAsync("user-2", "cashier", "Manager", "admin-1"));
        var changed = await WriteAsync(a => a.PasswordChangedAsync("user-2", "cashier", wasReset: false));

        Payload(assigned).Action.ShouldBe(SecurityAction.RoleAssigned);
        Payload(assigned).ClaimsSnapshot!["actorId"].ShouldBe("admin-1");
        assigned.UserId.ShouldBe("user-2");
        Payload(revoked).Action.ShouldBe(SecurityAction.RoleRevoked);
        Payload(changed).Action.ShouldBe(SecurityAction.PasswordChanged);
        Payload(changed).ReasonCode.ShouldBe("PasswordChanged");
    }

    [Fact]
    public async Task TokenRevoked_Should_Leave_UserId_Empty_For_Unknown_Subjects()
    {
        var e = await WriteAsync(a => a.TokenRevokedAsync("unknown", "web", "InvalidRefreshToken"));

        e.UserId.ShouldBeNull();
    }
}
