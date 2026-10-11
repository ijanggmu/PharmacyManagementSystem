using FSH.Modules.Identity.Domain;

namespace Identity.Tests.Services;

/// <summary>
/// Refresh-token rotation is strict: once a session's token is rotated, only the new token is accepted.
/// Concurrent refreshes are de-duplicated client-side (the web BFF single-flights refresh per session).
/// </summary>
public sealed class UserSessionRefreshRotationTests
{
    [Fact]
    public void Rotation_Should_Reject_The_Previous_Token_Immediately()
    {
        var session = UserSession.Create("user-1", "HASH-1", "127.0.0.1", "ua", DateTime.UtcNow.AddDays(7));

        session.UpdateRefreshToken("HASH-2", DateTime.UtcNow.AddDays(7));

        session.Accepts("HASH-2").ShouldBeTrue();
        session.Accepts("HASH-1").ShouldBeFalse();
        session.Accepts("HASH-X").ShouldBeFalse();
        session.PreviousRefreshTokenHash.ShouldBe("HASH-1");
    }

    [Fact]
    public void Second_Rotation_Should_Only_Accept_The_Newest_Token()
    {
        var session = UserSession.Create("user-1", "HASH-1", "127.0.0.1", "ua", DateTime.UtcNow.AddDays(7));
        session.UpdateRefreshToken("HASH-2", DateTime.UtcNow.AddDays(7));
        session.UpdateRefreshToken("HASH-3", DateTime.UtcNow.AddDays(7));

        session.Accepts("HASH-1").ShouldBeFalse();
        session.Accepts("HASH-2").ShouldBeFalse();
        session.Accepts("HASH-3").ShouldBeTrue();
    }
}
