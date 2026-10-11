using System.Security.Claims;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Identity.Authorization;
using FSH.Modules.Identity.Contracts.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using NSubstitute;

namespace Identity.Tests.Authorization;

public sealed class RequiredPermissionAuthorizationHandlerTests
{
    private const string UserId = "user-1";
    private readonly IUserService _userService = Substitute.For<IUserService>();

    private static AuthorizationHandlerContext ContextFor(Endpoint endpoint)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, UserId)], "test"));
        return new AuthorizationHandlerContext([new PermissionAuthorizationRequirement()], principal, endpoint);
    }

    private static Endpoint EndpointWith(params string[] permissions) =>
        new(_ => Task.CompletedTask, new EndpointMetadataCollection(new RequiredPermissionAttribute(permissions[0], permissions[1..])), "test");

    [Fact]
    public async Task Should_Fail_When_Caller_Holds_Only_First_Of_Several_Required_Permissions()
    {
        _userService.HasPermissionAsync(UserId, "Permissions.A.View", Arg.Any<CancellationToken>()).Returns(true);
        _userService.HasPermissionAsync(UserId, "Permissions.B.View", Arg.Any<CancellationToken>()).Returns(false);
        var context = ContextFor(EndpointWith("Permissions.A.View", "Permissions.B.View"));

        await new RequiredPermissionAuthorizationHandler(_userService).HandleAsync(context);

        context.HasSucceeded.ShouldBeFalse();
    }

    [Fact]
    public async Task Should_Succeed_When_Caller_Holds_All_Required_Permissions()
    {
        _userService.HasPermissionAsync(UserId, Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
        var context = ContextFor(EndpointWith("Permissions.A.View", "Permissions.B.View"));

        await new RequiredPermissionAuthorizationHandler(_userService).HandleAsync(context);

        context.HasSucceeded.ShouldBeTrue();
        await _userService.Received(1).HasPermissionAsync(UserId, "Permissions.B.View", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Should_Succeed_When_Endpoint_Declares_No_Permission()
    {
        var endpoint = new Endpoint(_ => Task.CompletedTask, EndpointMetadataCollection.Empty, "open");
        var context = ContextFor(endpoint);

        await new RequiredPermissionAuthorizationHandler(_userService).HandleAsync(context);

        context.HasSucceeded.ShouldBeTrue();
    }
}
