using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;
using FSH.Modules.Multitenancy.Features.v1.GetMyTenantStatus;
using FSH.Modules.Multitenancy.Features.v1.GetTenantByCode;
using NSubstitute;

namespace Multitenancy.Tests.Features;

/// <summary>
/// The anonymous code lookup answers 404 for an unknown or inactive code, and the tenant status every user reads
/// only carries the owner's email for callers who manage users or tenants.
/// </summary>
public sealed class TenantLookupAndStatusTests
{
    private readonly ITenantService _tenants = Substitute.For<ITenantService>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IUserPermissionService _permissions = Substitute.For<IUserPermissionService>();
    private readonly Guid _userId = Guid.CreateVersion7();

    private static TenantStatusDto Status() => new()
    {
        Id = "demo",
        Name = "Demo Pharmacy",
        IsActive = true,
        ValidUpto = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        AdminEmail = "owner@demo.test",
        Plan = "free",
        ExpiryState = "Active",
    };

    [Fact]
    public async Task ByCode_Should_Return_TheTenant_When_ActiveCodeMatches()
    {
        _tenants.GetActiveByCodeAsync("demo", Arg.Any<CancellationToken>()).Returns(new TenantLookupDto("Demo Pharmacy", "demo"));

        var result = await new GetTenantByCodeQueryHandler(_tenants).Handle(new GetTenantByCodeQuery("demo"), CancellationToken.None);

        result.Name.ShouldBe("Demo Pharmacy");
    }

    [Fact]
    public async Task ByCode_Should_Be_NotFound_When_NoActiveTenantMatches()
    {
        _tenants.GetActiveByCodeAsync("nope", Arg.Any<CancellationToken>()).Returns(new TenantLookupDto(null, null));

        await Should.ThrowAsync<NotFoundException>(() =>
            new GetTenantByCodeQueryHandler(_tenants).Handle(new GetTenantByCodeQuery("nope"), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Status_Should_Hide_AdminEmail_From_Staff()
    {
        _currentUser.GetUserId().Returns(_userId);

        var result = await GetMyTenantStatusEndpoint.ForCallerAsync(Status(), _currentUser, _permissions);

        result.AdminEmail.ShouldBeNull();
        result.Plan.ShouldBe("free");
        result.ValidUpto.ShouldBe(Status().ValidUpto);
    }

    [Theory]
    [InlineData(IdentityPermissions.Users.Create)]
    [InlineData(MultitenancyPermissions.Tenants.View)]
    public async Task Status_Should_Keep_AdminEmail_For_UserOrTenantAdmins(string permission)
    {
        _currentUser.GetUserId().Returns(_userId);
        _permissions.HasPermissionAsync(_userId.ToString(), permission, Arg.Any<CancellationToken>()).Returns(true);

        var result = await GetMyTenantStatusEndpoint.ForCallerAsync(Status(), _currentUser, _permissions);

        result.AdminEmail.ShouldBe("owner@demo.test");
    }
}
