using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Multitenancy.Services;
using Microsoft.AspNetCore.Http;
using NSubstitute;

namespace Multitenancy.Tests.Services;

public sealed class CurrentBranchTests
{
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IUserProfileService _userProfileService = Substitute.For<IUserProfileService>();
    private readonly IBranchService _branchService = Substitute.For<IBranchService>();
    private readonly IHttpContextAccessor _httpContextAccessor = Substitute.For<IHttpContextAccessor>();
    private readonly IUserPermissionService _userPermissionService = Substitute.For<IUserPermissionService>();

    private CurrentBranch CreateSut() =>
        new(_currentUser, _userProfileService, _branchService, _httpContextAccessor, _userPermissionService);

    private void SetHeader(string? value)
    {
        var context = new DefaultHttpContext();
        if (value is not null)
        {
            context.Request.Headers[CurrentBranch.HeaderName] = value;
        }

        _httpContextAccessor.HttpContext.Returns(context);
    }

    #region Header override

    [Fact]
    public async Task GetBranchIdAsync_Should_UseHeader_When_HeaderIsAnActiveBranchOfTheTenant()
    {
        var branchId = Guid.NewGuid();
        SetHeader(branchId.ToString());
        _branchService.IsActiveBranchOfCurrentTenantAsync(branchId, Arg.Any<CancellationToken>())
            .Returns(true);

        var sut = CreateSut();

        var result = await sut.GetBranchIdAsync();

        result.ShouldBe(branchId);
        await _userProfileService.DidNotReceive()
            .GetCurrentBranchIdAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetBranchIdAsync_Should_Throw_Forbidden_When_HeaderIsNotAGuid()
    {
        SetHeader("not-a-guid");

        var sut = CreateSut();

        var act = () => sut.GetBranchIdAsync();

        await Should.ThrowAsync<ForbiddenException>(act);
    }

    [Fact]
    public async Task GetBranchIdAsync_Should_Throw_Forbidden_When_HeaderBranchIsNotActiveOrNotOwnedByTenant()
    {
        var branchId = Guid.NewGuid();
        SetHeader(branchId.ToString());
        _branchService.IsActiveBranchOfCurrentTenantAsync(branchId, Arg.Any<CancellationToken>())
            .Returns(false);

        var sut = CreateSut();

        var act = () => sut.GetBranchIdAsync();

        await Should.ThrowAsync<ForbiddenException>(act);
    }

    [Fact]
    public async Task GetBranchIdAsync_Should_Throw_Forbidden_When_HeaderGiven_But_NoTenantResolved()
    {
        var branchId = Guid.NewGuid();
        SetHeader(branchId.ToString());
        _branchService.IsActiveBranchOfCurrentTenantAsync(branchId, Arg.Any<CancellationToken>())
            .Returns(Task.FromException<bool>(new UnauthorizedException("invalid tenant")));

        var sut = CreateSut();

        var act = () => sut.GetBranchIdAsync();

        await Should.ThrowAsync<ForbiddenException>(act);
    }

    #endregion

    #region DB-lookup fallback (FshUser.CurrentBranchId)

    [Fact]
    public async Task GetBranchIdAsync_Should_UseUsersCurrentBranch_When_NoHeaderOverride()
    {
        SetHeader(null);
        var userId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(userId);
        _userProfileService.GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>())
            .Returns(branchId);

        var sut = CreateSut();

        var result = await sut.GetBranchIdAsync();

        result.ShouldBe(branchId);
        await _branchService.DidNotReceive().GetDefaultBranchIdAsync(Arg.Any<CancellationToken>());
    }

    #endregion

    #region No-branch-selected fallback (tenant default / none)

    [Fact]
    public async Task GetBranchIdAsync_Should_FallBackToTenantDefaultBranch_When_UserHasNoSelection()
    {
        SetHeader(null);
        var userId = Guid.NewGuid();
        var defaultBranchId = Guid.NewGuid();
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(userId);
        _userProfileService.GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>())
            .Returns((Guid?)null);
        _branchService.GetDefaultBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns(defaultBranchId);

        var sut = CreateSut();

        var result = await sut.GetBranchIdAsync();

        result.ShouldBe(defaultBranchId);
    }

    [Fact]
    public async Task GetBranchIdAsync_Should_ReturnNull_When_TenantHasNoBranches()
    {
        SetHeader(null);
        _currentUser.IsAuthenticated().Returns(false);
        _branchService.GetDefaultBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns((Guid?)null);

        var sut = CreateSut();

        var result = await sut.GetBranchIdAsync();

        result.ShouldBeNull();
    }

    [Fact]
    public async Task GetBranchIdAsync_Should_ReturnNull_When_NoTenantResolvedAtAll()
    {
        SetHeader(null);
        _currentUser.IsAuthenticated().Returns(false);
        _branchService.GetDefaultBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromException<Guid?>(new UnauthorizedException("invalid tenant")));

        var sut = CreateSut();

        var result = await sut.GetBranchIdAsync();

        result.ShouldBeNull();
    }

    [Fact]
    public async Task RequireBranchIdAsync_Should_Throw_NotFound_When_NoBranchCanBeResolved()
    {
        SetHeader(null);
        _currentUser.IsAuthenticated().Returns(false);
        _branchService.GetDefaultBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns((Guid?)null);

        var sut = CreateSut();

        var act = () => sut.RequireBranchIdAsync();

        await Should.ThrowAsync<NotFoundException>(act);
    }

    [Fact]
    public async Task RequireBranchIdAsync_Should_ReturnBranchId_When_Resolved()
    {
        var branchId = Guid.NewGuid();
        SetHeader(branchId.ToString());
        _branchService.IsActiveBranchOfCurrentTenantAsync(branchId, Arg.Any<CancellationToken>())
            .Returns(true);

        var sut = CreateSut();

        var result = await sut.RequireBranchIdAsync();

        result.ShouldBe(branchId);
    }

    #endregion

    #region List filter (ViewAll-aware)

    [Fact]
    public async Task GetListFilterBranchIdAsync_Should_ReturnCallersBranch_When_StaffWithoutViewAll()
    {
        SetHeader(null);
        var userId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(userId);
        _userPermissionService.HasPermissionAsync(userId.ToString(), MultitenancyPermissions.Branches.ViewAll, Arg.Any<CancellationToken>())
            .Returns(false);
        _userProfileService.GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>())
            .Returns(branchId);

        var sut = CreateSut();

        var result = await sut.GetListFilterBranchIdAsync();

        result.ShouldBe(branchId);
    }

    [Fact]
    public async Task GetListFilterBranchIdAsync_Should_ReturnNull_When_CallerHoldsViewAll()
    {
        SetHeader(null);
        var userId = Guid.NewGuid();
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(userId);
        _userPermissionService.HasPermissionAsync(userId.ToString(), MultitenancyPermissions.Branches.ViewAll, Arg.Any<CancellationToken>())
            .Returns(true);
        _userProfileService.GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>())
            .Returns(Guid.NewGuid());

        var sut = CreateSut();

        var result = await sut.GetListFilterBranchIdAsync();

        result.ShouldBeNull();
    }

    [Fact]
    public async Task GetListFilterBranchIdAsync_Should_ReturnHeaderBranch_When_StaffSendsActiveHeader()
    {
        var branchId = Guid.NewGuid();
        SetHeader(branchId.ToString());
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(Guid.NewGuid());
        _userPermissionService.HasPermissionAsync(Arg.Any<string>(), MultitenancyPermissions.Branches.ViewAll, Arg.Any<CancellationToken>())
            .Returns(false);
        _branchService.IsActiveBranchOfCurrentTenantAsync(branchId, Arg.Any<CancellationToken>())
            .Returns(true);

        var sut = CreateSut();

        var result = await sut.GetListFilterBranchIdAsync();

        result.ShouldBe(branchId);
    }

    [Fact]
    public async Task GetListFilterBranchIdAsync_Should_ReturnNull_When_NoTenantResolved()
    {
        SetHeader(null);
        var userId = Guid.NewGuid();
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(userId);
        _userPermissionService.HasPermissionAsync(userId.ToString(), MultitenancyPermissions.Branches.ViewAll, Arg.Any<CancellationToken>())
            .Returns(Task.FromException<bool>(new UnauthorizedException("invalid tenant")));
        _branchService.GetDefaultBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromException<Guid?>(new UnauthorizedException("invalid tenant")));

        var sut = CreateSut();

        var result = await sut.GetListFilterBranchIdAsync();

        result.ShouldBeNull();
    }

    [Fact]
    public async Task GetListFilterBranchIdAsync_Should_NotCheckPermission_When_Anonymous()
    {
        SetHeader(null);
        _currentUser.IsAuthenticated().Returns(false);
        _branchService.GetDefaultBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns((Guid?)null);

        var sut = CreateSut();

        var result = await sut.GetListFilterBranchIdAsync();

        result.ShouldBeNull();
        await _userPermissionService.DidNotReceive()
            .HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetListFilterBranchIdAsync_Should_ResolveOnlyOnce_PerInstance()
    {
        SetHeader(null);
        var userId = Guid.NewGuid();
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(userId);
        _userPermissionService.HasPermissionAsync(userId.ToString(), MultitenancyPermissions.Branches.ViewAll, Arg.Any<CancellationToken>())
            .Returns(true);

        var sut = CreateSut();

        await sut.GetListFilterBranchIdAsync();
        await sut.GetListFilterBranchIdAsync();

        await _userPermissionService.Received(1)
            .HasPermissionAsync(userId.ToString(), MultitenancyPermissions.Branches.ViewAll, Arg.Any<CancellationToken>());
    }

    #endregion

    #region Branch confinement (callers without ViewAll)

    private void ArrangeStaff(Guid userId, Guid ownBranchId, bool viewAll = false)
    {
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(userId);
        _userPermissionService.HasPermissionAsync(userId.ToString(), MultitenancyPermissions.Branches.ViewAll, Arg.Any<CancellationToken>())
            .Returns(viewAll);
        _userProfileService.GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>())
            .Returns(ownBranchId);
    }

    [Fact]
    public async Task GetBranchIdAsync_Should_Throw_Forbidden_When_StaffHeaderNamesAnotherBranch()
    {
        var otherBranchId = Guid.NewGuid();
        SetHeader(otherBranchId.ToString());
        ArrangeStaff(Guid.NewGuid(), ownBranchId: Guid.NewGuid());
        _branchService.IsActiveBranchOfCurrentTenantAsync(otherBranchId, Arg.Any<CancellationToken>())
            .Returns(true);

        var sut = CreateSut();

        var act = () => sut.GetBranchIdAsync();

        await Should.ThrowAsync<ForbiddenException>(act);
    }

    [Fact]
    public async Task GetBranchIdAsync_Should_AcceptHeader_When_StaffHeaderNamesOwnBranch()
    {
        var ownBranchId = Guid.NewGuid();
        SetHeader(ownBranchId.ToString());
        ArrangeStaff(Guid.NewGuid(), ownBranchId);
        _branchService.IsActiveBranchOfCurrentTenantAsync(ownBranchId, Arg.Any<CancellationToken>())
            .Returns(true);

        var sut = CreateSut();

        var result = await sut.GetBranchIdAsync();

        result.ShouldBe(ownBranchId);
    }

    [Fact]
    public async Task GetBranchIdAsync_Should_AcceptAnyActiveHeaderBranch_When_CallerHoldsViewAll()
    {
        var otherBranchId = Guid.NewGuid();
        SetHeader(otherBranchId.ToString());
        ArrangeStaff(Guid.NewGuid(), ownBranchId: Guid.NewGuid(), viewAll: true);
        _branchService.IsActiveBranchOfCurrentTenantAsync(otherBranchId, Arg.Any<CancellationToken>())
            .Returns(true);

        var sut = CreateSut();

        var result = await sut.GetBranchIdAsync();

        result.ShouldBe(otherBranchId);
    }

    [Fact]
    public async Task ResolveListBranchFilterAsync_Should_ReturnRequested_When_CallerHoldsViewAll()
    {
        SetHeader(null);
        var requested = Guid.NewGuid();
        ArrangeStaff(Guid.NewGuid(), ownBranchId: Guid.NewGuid(), viewAll: true);

        var sut = CreateSut();

        (await sut.ResolveListBranchFilterAsync(requested)).ShouldBe(requested);
        (await sut.ResolveListBranchFilterAsync(null)).ShouldBeNull();
    }

    [Fact]
    public async Task ResolveListBranchFilterAsync_Should_ReturnOwnBranch_When_StaffRequestsNullOrOwnBranch()
    {
        SetHeader(null);
        var ownBranchId = Guid.NewGuid();
        ArrangeStaff(Guid.NewGuid(), ownBranchId);

        var sut = CreateSut();

        (await sut.ResolveListBranchFilterAsync(null)).ShouldBe(ownBranchId);
        (await sut.ResolveListBranchFilterAsync(ownBranchId)).ShouldBe(ownBranchId);
    }

    [Fact]
    public async Task ResolveListBranchFilterAsync_Should_Throw_Forbidden_When_StaffRequestsAnotherBranch()
    {
        SetHeader(null);
        ArrangeStaff(Guid.NewGuid(), ownBranchId: Guid.NewGuid());

        var sut = CreateSut();

        var act = () => sut.ResolveListBranchFilterAsync(Guid.NewGuid());

        await Should.ThrowAsync<ForbiddenException>(act);
    }

    [Fact]
    public async Task ResolveListBranchFilterAsync_Should_ReturnRequested_When_ThereIsNoBranchToConfineTo()
    {
        SetHeader(null);
        var requested = Guid.NewGuid();
        _currentUser.IsAuthenticated().Returns(false);
        _branchService.GetDefaultBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns((Guid?)null);

        var sut = CreateSut();

        (await sut.ResolveListBranchFilterAsync(requested)).ShouldBe(requested);
    }

    [Fact]
    public async Task CanViewAllBranchesAsync_Should_CheckPermissionOnlyOnce_PerInstance()
    {
        SetHeader(null);
        var userId = Guid.NewGuid();
        ArrangeStaff(userId, ownBranchId: Guid.NewGuid());

        var sut = CreateSut();

        await sut.CanViewAllBranchesAsync();
        await sut.ResolveListBranchFilterAsync(null);
        await sut.GetListFilterBranchIdAsync();

        await _userPermissionService.Received(1)
            .HasPermissionAsync(userId.ToString(), MultitenancyPermissions.Branches.ViewAll, Arg.Any<CancellationToken>());
    }

    #endregion

    #region Per-request caching

    [Fact]
    public async Task GetBranchIdAsync_Should_ResolveOnlyOnce_PerInstance()
    {
        SetHeader(null);
        var userId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        _currentUser.IsAuthenticated().Returns(true);
        _currentUser.GetUserId().Returns(userId);
        _userProfileService.GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>())
            .Returns(branchId);

        var sut = CreateSut();

        var first = await sut.GetBranchIdAsync();
        var second = await sut.GetBranchIdAsync();

        first.ShouldBe(branchId);
        second.ShouldBe(branchId);
        await _userProfileService.Received(1)
            .GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>());
    }

    #endregion
}
