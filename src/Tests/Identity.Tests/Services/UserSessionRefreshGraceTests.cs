using FSH.Modules.Identity;
using FSH.Modules.Identity.Domain;

namespace Identity.Tests.Services;

/// <summary>
/// Refresh-token rotation keeps the immediately-previous token valid for a short grace window, so two
/// concurrent refreshes with the same token (two tabs, proxy + page) don't log the user out.
/// </summary>
public sealed class UserSessionRefreshGraceTests
{
    private static readonly TimeSpan Grace = IdentityModuleConstants.RefreshTokenReuseGrace;

    [Fact]
    public void Rotation_Should_Keep_Previous_Token_Valid_Within_Grace_Only()
    {
        var session = UserSession.Create("user-1", "HASH-1", "127.0.0.1", "ua", DateTime.UtcNow.AddDays(7));

        session.UpdateRefreshToken("HASH-2", DateTime.UtcNow.AddDays(7));
        var rotatedAt = session.RefreshTokenRotatedAt!.Value;

        session.Accepts("HASH-2", rotatedAt, Grace).ShouldBeTrue();
        session.Accepts("HASH-1", rotatedAt.AddSeconds(5), Grace).ShouldBeTrue();
        session.Accepts("HASH-1", rotatedAt + Grace + TimeSpan.FromSeconds(1), Grace).ShouldBeFalse();
        session.Accepts("HASH-X", rotatedAt, Grace).ShouldBeFalse();
    }

    [Fact]
    public void Second_Rotation_Should_Drop_The_Oldest_Token()
    {
        var session = UserSession.Create("user-1", "HASH-1", "127.0.0.1", "ua", DateTime.UtcNow.AddDays(7));
        session.UpdateRefreshToken("HASH-2", DateTime.UtcNow.AddDays(7));
        session.UpdateRefreshToken("HASH-3", DateTime.UtcNow.AddDays(7));
        var rotatedAt = session.RefreshTokenRotatedAt!.Value;

        session.Accepts("HASH-1", rotatedAt, Grace).ShouldBeFalse();
        session.Accepts("HASH-2", rotatedAt, Grace).ShouldBeTrue();
        session.Accepts("HASH-3", rotatedAt, Grace).ShouldBeTrue();
    }
}
