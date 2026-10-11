using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Users.SelfRegisterUser;
using FSH.Modules.Identity.Features.v1.Users.SelfRegistration;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Identity.Tests.Handlers;

public sealed class SelfRegisterUserCommandHandlerTests
{
    private readonly IUserRegistrationService _registration = Substitute.For<IUserRegistrationService>();

    private SelfRegisterUserCommandHandler CreateSut(string tenantId, params string[] allowed)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        var mtContext = Substitute.For<IMultiTenantContext<AppTenantInfo>>();
        mtContext.TenantInfo.Returns(new AppTenantInfo(tenantId, tenantId, tenantId));
        accessor.MultiTenantContext.Returns(mtContext);
        return new SelfRegisterUserCommandHandler(
            _registration, accessor, Options.Create(new SelfRegistrationOptions { AllowedTenants = allowed }));
    }

    private static SelfRegisterUserCommand Command() => new()
    {
        FirstName = "A",
        LastName = "B",
        Email = "a@b.com",
        UserName = "ab",
        Password = "Password123!",
        ConfirmPassword = "Password123!",
    };

    [Fact]
    public async Task Handle_Should_Throw_NotFound_When_Tenant_Not_Opted_In()
    {
        var sut = CreateSut("pharmacy-a");

        await Should.ThrowAsync<NotFoundException>(async () => await sut.Handle(Command(), CancellationToken.None));
        await _registration.DidNotReceiveWithAnyArgs().SelfRegisterAsync(default!, default!, default!, default!, default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task Handle_Should_Never_Allow_Root_Even_With_Wildcard()
    {
        var sut = CreateSut(MultitenancyConstants.Root.Id, "*");

        await Should.ThrowAsync<NotFoundException>(async () => await sut.Handle(Command(), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_Should_Use_Unconfirmed_SelfRegister_Path_When_Opted_In()
    {
        _registration.SelfRegisterAsync(default!, default!, default!, default!, default!, default!, default!, default!, default)
            .ReturnsForAnyArgs("user-1");
        var sut = CreateSut("pharmacy-a", "PHARMACY-A");

        var result = await sut.Handle(Command(), CancellationToken.None);

        result.UserId.ShouldBe("user-1");
        await _registration.ReceivedWithAnyArgs(1).SelfRegisterAsync(default!, default!, default!, default!, default!, default!, default!, default!, default);
        await _registration.DidNotReceiveWithAnyArgs().RegisterAsync(default!, default!, default!, default!, default!, default!, default!, default!, default);
    }
}
