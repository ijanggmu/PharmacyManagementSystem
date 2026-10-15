using System.Security.Claims;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Outbox;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.ExternalLogins;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Features.v1.ExternalLogins;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;
using Mediator;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace Identity.Tests.Handlers;

public sealed class GoogleExternalLoginHandlerTests
{
    private static readonly GoogleIdentity Google = new("google-sub-1", "owner@sunrise.com", true, "Asha", "Rai", "Asha Rai", null);

    private readonly IGoogleIdTokenValidator _googleTokens = Substitute.For<IGoogleIdTokenValidator>();
    private readonly IIdentityService _identityService = Substitute.For<IIdentityService>();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly ISecurityAudit _audit = Substitute.For<ISecurityAudit>();
    private readonly IRequestContext _requestContext = Substitute.For<IRequestContext>();
    private readonly ITokenService _tokenService = Substitute.For<ITokenService>();
    private readonly IOutboxStore _outbox = Substitute.For<IOutboxStore>();

    public GoogleExternalLoginHandlerTests()
    {
        _googleTokens.IsEnabled.Returns(true);
        _googleTokens.ValidateAsync("valid-token", Arg.Any<CancellationToken>()).Returns(Google);
        _googleTokens.ValidateAsync("bad-token", Arg.Any<CancellationToken>())
            .Throws(new UnauthorizedException("google_token_invalid: nope"));
    }

    private LoginTokenIssuer CreateIssuer()
    {
        _tokenService.IssueAsync(Arg.Any<string>(), Arg.Any<IEnumerable<Claim>>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(new TokenResponse("access", "refresh", DateTime.UtcNow.AddDays(7), DateTime.UtcNow.AddMinutes(45)));
        var tenantAccessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        return new LoginTokenIssuer(
            _identityService, _tokenService, _audit, _requestContext, _outbox, tenantAccessor,
            Substitute.For<ISessionService>());
    }

    [Fact]
    public async Task Resolve_Should_ReturnNoPharmacies_When_GoogleAccountIsNotConnected()
    {
        _identityService.FindExternalLoginTenantsAsync("Google", "google-sub-1", Arg.Any<CancellationToken>()).Returns([]);
        var handler = new ResolveGoogleLoginQueryHandler(_googleTokens, _identityService, _mediator);

        var result = await handler.Handle(new ResolveGoogleLoginQuery("valid-token"), CancellationToken.None);

        result.Email.ShouldBe("owner@sunrise.com");
        result.Tenants.ShouldBeEmpty();
    }

    [Fact]
    public async Task Resolve_Should_ListActivePharmacies_AndSkipInactiveOnes()
    {
        _identityService.FindExternalLoginTenantsAsync("Google", "google-sub-1", Arg.Any<CancellationToken>())
            .Returns(["globex", "acme", "closed"]);
        _mediator.Send(new GetTenantByCodeQuery("acme"), Arg.Any<CancellationToken>()).Returns(new TenantLookupDto("Acme Pharmacy", "acme"));
        _mediator.Send(new GetTenantByCodeQuery("globex"), Arg.Any<CancellationToken>()).Returns(new TenantLookupDto("Globex", "globex"));
        _mediator.Send(new GetTenantByCodeQuery("closed"), Arg.Any<CancellationToken>()).Returns(new TenantLookupDto(null, null));
        var handler = new ResolveGoogleLoginQueryHandler(_googleTokens, _identityService, _mediator);

        var result = await handler.Handle(new ResolveGoogleLoginQuery("valid-token"), CancellationToken.None);

        result.Tenants.Select(t => t.TenantId).ShouldBe(["acme", "globex"]);
        result.Tenants[0].TenantName.ShouldBe("Acme Pharmacy");
    }

    [Fact]
    public async Task Resolve_Should_SkipAPharmacyTheLookupRefuses_AsClosed()
    {
        _identityService.FindExternalLoginTenantsAsync("Google", "google-sub-1", Arg.Any<CancellationToken>())
            .Returns(["acme", "closed"]);
        _mediator.Send(new GetTenantByCodeQuery("acme"), Arg.Any<CancellationToken>()).Returns(new TenantLookupDto("Acme Pharmacy", "acme"));
        _mediator.Send(new GetTenantByCodeQuery("closed"), Arg.Any<CancellationToken>())
            .ThrowsAsync(new NotFoundException("No active pharmacy uses this code."));
        var handler = new ResolveGoogleLoginQueryHandler(_googleTokens, _identityService, _mediator);

        var result = await handler.Handle(new ResolveGoogleLoginQuery("valid-token"), CancellationToken.None);

        result.Tenants.Select(t => t.TenantId).ShouldBe(["acme"]);
    }

    [Fact]
    public async Task Resolve_Should_RejectAnInvalidToken_BeforeAnyLookup()
    {
        var handler = new ResolveGoogleLoginQueryHandler(_googleTokens, _identityService, _mediator);

        await Should.ThrowAsync<UnauthorizedException>(
            () => handler.Handle(new ResolveGoogleLoginQuery("bad-token"), CancellationToken.None).AsTask());
        await _identityService.DidNotReceiveWithAnyArgs().FindExternalLoginTenantsAsync(default!, default!, default);
    }

    [Fact]
    public async Task GoogleToken_Should_IssueTokens_When_LoginIsConnectedInThisPharmacy()
    {
        _identityService.ValidateExternalLoginAsync("Google", "google-sub-1", null, null, Arg.Any<CancellationToken>())
            .Returns(("user-1", (IEnumerable<Claim>)[new Claim(ClaimTypes.Name, "Asha Rai")]));
        var handler = new GoogleTokenCommandHandler(_googleTokens, _identityService, CreateIssuer(), _audit, _requestContext);

        var token = await handler.Handle(new GoogleTokenCommand("valid-token"), CancellationToken.None);

        token.AccessToken.ShouldBe("access");
        await _identityService.Received(1).StoreRefreshTokenAsync("user-1", "refresh", Arg.Any<DateTime>(), Arg.Any<CancellationToken>());
        await _outbox.Received(1).AddAsync(Arg.Any<FSH.Modules.Identity.Contracts.Events.TokenGeneratedIntegrationEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GoogleToken_Should_AuditAndRethrow_When_NotConnected()
    {
        _identityService.ValidateExternalLoginAsync("Google", "google-sub-1", null, null, Arg.Any<CancellationToken>())
            .Throws(new UnauthorizedException("external_login_not_linked: not here"));
        var handler = new GoogleTokenCommandHandler(_googleTokens, _identityService, CreateIssuer(), _audit, _requestContext);

        await Should.ThrowAsync<UnauthorizedException>(
            () => handler.Handle(new GoogleTokenCommand("valid-token"), CancellationToken.None).AsTask());
        await _audit.Received(1).LoginFailedAsync("owner@sunrise.com", Arg.Any<string>(), "GoogleLoginRejected", Arg.Any<string>(), Arg.Any<CancellationToken>());
        await _tokenService.DidNotReceiveWithAnyArgs().IssueAsync(default!, default!, default, default);
    }

    [Fact]
    public async Task GoogleToken_Should_PassTwoFactorPromptThrough_WithoutAuditingAFailure()
    {
        _identityService.ValidateExternalLoginAsync("Google", "google-sub-1", null, null, Arg.Any<CancellationToken>())
            .Throws(new UnauthorizedException("two_factor_invalid: bad code"));
        var handler = new GoogleTokenCommandHandler(_googleTokens, _identityService, CreateIssuer(), _audit, _requestContext);

        await Should.ThrowAsync<UnauthorizedException>(
            () => handler.Handle(new GoogleTokenCommand("valid-token"), CancellationToken.None).AsTask());
        await _audit.DidNotReceiveWithAnyArgs().LoginFailedAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task VerifySignUp_Should_RejectUnverifiedEmail()
    {
        _googleTokens.ValidateAsync("unverified", Arg.Any<CancellationToken>()).Returns(Google with { EmailVerified = false });
        var handler = new VerifyGoogleSignUpQueryHandler(_googleTokens);

        await Should.ThrowAsync<UnauthorizedException>(
            () => handler.Handle(new VerifyGoogleSignUpQuery("unverified"), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task VerifySignUp_Should_ReturnProfile()
    {
        var handler = new VerifyGoogleSignUpQueryHandler(_googleTokens);

        var profile = await handler.Handle(new VerifyGoogleSignUpQuery("valid-token"), CancellationToken.None);

        profile.ShouldBe(new GoogleSignUpProfile("owner@sunrise.com", "Asha", "Rai", null));
    }
}

public sealed class ConnectedAccountHandlerTests
{
    private static readonly GoogleIdentity Google = new("google-sub-1", "owner@sunrise.com", true, "Asha", "Rai", "Asha Rai", null);

    private readonly UserManager<FshUser> _userManager;
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IGoogleIdTokenValidator _googleTokens = Substitute.For<IGoogleIdTokenValidator>();
    private readonly FshUser _user = new() { Id = Guid.NewGuid().ToString(), Email = "owner@sunrise.com", UserName = "owner" };

    public ConnectedAccountHandlerTests()
    {
        _userManager = Substitute.For<UserManager<FshUser>>(
            Substitute.For<IUserStore<FshUser>>(), null!, null!, null!, null!, null!, null!, null!, null!);
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(Guid.Parse(_user.Id));
        _userManager.FindByIdAsync(_user.Id).Returns(_user);
        _googleTokens.ValidateAsync("valid-token", Arg.Any<CancellationToken>()).Returns(Google);
        _googleTokens.IsEnabled.Returns(true);
    }

    [Fact]
    public async Task Connect_Should_AddTheGoogleLogin()
    {
        _userManager.FindByLoginAsync("Google", "google-sub-1").Returns((FshUser?)null);
        _userManager.GetLoginsAsync(_user).Returns([]);
        _userManager.AddLoginAsync(_user, Arg.Any<UserLoginInfo>()).Returns(IdentityResult.Success);
        var handler = new ConnectGoogleLoginCommandHandler(_googleTokens, _userManager, _currentUser);

        var result = await handler.Handle(new ConnectGoogleLoginCommand("valid-token"), CancellationToken.None);

        result.ShouldBe(new ExternalLoginDto("Google", "owner@sunrise.com"));
        await _userManager.Received(1).AddLoginAsync(
            _user, Arg.Is<UserLoginInfo>(l => l.LoginProvider == "Google" && l.ProviderKey == "google-sub-1"));
    }

    [Fact]
    public async Task Connect_Should_Refuse_WhenAnotherUserOfThisPharmacyHasThatGoogleAccount()
    {
        _userManager.FindByLoginAsync("Google", "google-sub-1").Returns(new FshUser { Id = "someone-else" });
        var handler = new ConnectGoogleLoginCommandHandler(_googleTokens, _userManager, _currentUser);

        var ex = await Should.ThrowAsync<CustomException>(
            () => handler.Handle(new ConnectGoogleLoginCommand("valid-token"), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        await _userManager.DidNotReceiveWithAnyArgs().AddLoginAsync(default!, default!);
    }

    [Fact]
    public async Task Disconnect_Should_Refuse_When_GoogleIsTheOnlyWayToSignIn()
    {
        _userManager.GetLoginsAsync(_user).Returns([new UserLoginInfo("Google", "google-sub-1", "owner@sunrise.com")]);
        _userManager.HasPasswordAsync(_user).Returns(false);
        var handler = new DisconnectGoogleLoginCommandHandler(_userManager, _currentUser);

        var ex = await Should.ThrowAsync<CustomException>(
            () => handler.Handle(new DisconnectGoogleLoginCommand(), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Disconnect_Should_RemoveTheLogin_When_UserHasAPassword()
    {
        _userManager.GetLoginsAsync(_user).Returns([new UserLoginInfo("Google", "google-sub-1", "owner@sunrise.com")]);
        _userManager.HasPasswordAsync(_user).Returns(true);
        _userManager.RemoveLoginAsync(_user, "Google", "google-sub-1").Returns(IdentityResult.Success);
        var handler = new DisconnectGoogleLoginCommandHandler(_userManager, _currentUser);

        (await handler.Handle(new DisconnectGoogleLoginCommand(), CancellationToken.None)).ShouldBeTrue();
        await _userManager.Received(1).RemoveLoginAsync(_user, "Google", "google-sub-1");
    }

    [Fact]
    public async Task GetMine_Should_ListLoginsAndPasswordState()
    {
        _userManager.GetLoginsAsync(_user).Returns([new UserLoginInfo("Google", "google-sub-1", "owner@sunrise.com")]);
        _userManager.HasPasswordAsync(_user).Returns(true);
        var handler = new GetMyExternalLoginsQueryHandler(_userManager, _currentUser, _googleTokens);

        var result = await handler.Handle(new GetMyExternalLoginsQuery(), CancellationToken.None);

        result.Logins.ShouldHaveSingleItem().DisplayName.ShouldBe("owner@sunrise.com");
        result.HasPassword.ShouldBeTrue();
        result.GoogleEnabled.ShouldBeTrue();
    }
}
