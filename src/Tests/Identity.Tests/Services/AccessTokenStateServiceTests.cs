using System.Security.Claims;
using FSH.Framework.Shared.Constants;
using FSH.Modules.Identity.Authorization.Jwt;
using FSH.Modules.Identity.Services;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;

namespace Identity.Tests.Services;

/// <summary>
/// The JWT hook's live check: a token of a deactivated / deleted user, or of a revoked session, is refused even
/// though its signature and lifetime are fine; answers are cached briefly and dropped on deactivate / revoke.
/// </summary>
public sealed class AccessTokenStateServiceTests
{
    private const string Tenant = "pharmacy-a";
    private const string UserId = "0198f6a0-0000-7000-8000-000000000001";

    /// <summary>Hand-rolled store (the interface is internal, so it can't be proxied): records lookups.</summary>
    private sealed class FakeStore : IAccessTokenStateStore
    {
        public Dictionary<(string Tenant, string UserId), TokenSubjectState> Users { get; } = [];
        public Dictionary<(string Tenant, Guid SessionId), TokenSubjectState> Sessions { get; } = [];
        public int UserLookups { get; private set; }
        public int SessionLookups { get; private set; }

        public Task<TokenSubjectState> GetUserStateAsync(string tenantId, string userId, CancellationToken cancellationToken)
        {
            UserLookups++;
            return Task.FromResult(Users.TryGetValue((tenantId, userId), out var s) ? s : TokenSubjectState.Missing);
        }

        public Task<TokenSubjectState> GetSessionStateAsync(string tenantId, Guid sessionId, CancellationToken cancellationToken)
        {
            SessionLookups++;
            return Task.FromResult(Sessions.TryGetValue((tenantId, sessionId), out var s) ? s : TokenSubjectState.Active);
        }
    }

    private readonly FakeStore _store = new();
    private readonly AccessTokenStateService _sut;

    public AccessTokenStateServiceTests()
    {
        var cache = new ServiceCollection().AddHybridCache().Services.BuildServiceProvider().GetRequiredService<HybridCache>();
        _sut = new AccessTokenStateService(cache, _store);
        _store.Users[(Tenant, UserId)] = TokenSubjectState.Active;
    }

    private static ClaimsPrincipal Principal(Guid? sessionId = null, string tenant = Tenant)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, UserId),
            new(ClaimConstants.Tenant, tenant),
        };
        if (sessionId is Guid sid)
        {
            // JwtBearer maps the inbound "sid" to ClaimTypes.Sid; the reader must accept that spelling.
            claims.Add(new Claim(ClaimTypes.Sid, sid.ToString()));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));
    }

    [Fact]
    public async Task Should_Accept_ActiveUser_With_LiveSession()
    {
        (await _sut.GetRejectionReasonAsync(Principal(Guid.NewGuid()))).ShouldBeNull();
    }

    [Theory]
    [InlineData((int)TokenSubjectState.Inactive)]
    [InlineData((int)TokenSubjectState.Missing)]
    public async Task Should_Reject_When_UserIsDeactivatedOrDeleted(int state)
    {
        _store.Users[(Tenant, UserId)] = (TokenSubjectState)state;

        (await _sut.GetRejectionReasonAsync(Principal())).ShouldNotBeNull();
    }

    [Theory]
    [InlineData((int)TokenSubjectState.Inactive)]
    [InlineData((int)TokenSubjectState.Missing)]
    public async Task Should_Reject_When_SessionIsRevokedOrGone(int state)
    {
        var sessionId = Guid.NewGuid();
        _store.Sessions[(Tenant, sessionId)] = (TokenSubjectState)state;

        (await _sut.GetRejectionReasonAsync(Principal(sessionId))).ShouldBe("session has been revoked");
    }

    [Fact]
    public async Task Should_SkipSessionCheck_For_TokensWithoutSessionId()
    {
        (await _sut.GetRejectionReasonAsync(Principal())).ShouldBeNull();

        _store.SessionLookups.ShouldBe(0);
    }

    [Fact]
    public async Task Should_CacheTheAnswer_ButDropIt_When_UserIsDeactivated()
    {
        await _sut.GetRejectionReasonAsync(Principal());
        await _sut.GetRejectionReasonAsync(Principal());
        _store.UserLookups.ShouldBe(1);

        _store.Users[(Tenant, UserId)] = TokenSubjectState.Inactive;
        await _sut.InvalidateUserAsync(Tenant, UserId);

        (await _sut.GetRejectionReasonAsync(Principal())).ShouldNotBeNull();
    }

    [Fact]
    public async Task Should_DropCachedSession_When_Revoked()
    {
        var sessionId = Guid.NewGuid();
        (await _sut.GetRejectionReasonAsync(Principal(sessionId))).ShouldBeNull();

        _store.Sessions[(Tenant, sessionId)] = TokenSubjectState.Inactive;
        await _sut.InvalidateSessionsAsync(Tenant, [sessionId]);

        (await _sut.GetRejectionReasonAsync(Principal(sessionId))).ShouldNotBeNull();
    }

    [Fact]
    public async Task Should_KeepTenantsApart_InTheCache()
    {
        (await _sut.GetRejectionReasonAsync(Principal())).ShouldBeNull();
        (await _sut.GetRejectionReasonAsync(Principal(tenant: "pharmacy-b"))).ShouldNotBeNull();
    }

    [Fact]
    public void SessionClaims_Should_ReplaceAnyExistingSessionId()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();

        var claims = SessionClaims.WithSessionId(SessionClaims.WithSessionId([new Claim("sub", UserId)], first), second);

        SessionClaims.GetSessionId(claims).ShouldBe(second);
        claims.Count(c => c.Type == SessionClaims.SessionId).ShouldBe(1);
        claims.ShouldContain(c => c.Type == "sub");
    }
}
