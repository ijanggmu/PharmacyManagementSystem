using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.SwitchBranch;
using FSH.Modules.Multitenancy.Features.v1.SwitchBranch;
using NSubstitute;

namespace Multitenancy.Tests.Features.Branches;

public sealed class SwitchBranchCommandHandlerTests
{
    private readonly IBranchService _branchService = Substitute.For<IBranchService>();
    private readonly IUserProfileService _userProfileService = Substitute.For<IUserProfileService>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly SwitchBranchCommandHandler _sut;

    public SwitchBranchCommandHandlerTests()
    {
        // Default: a caller holding Branches.ViewAll (e.g. Admin) may switch to any branch.
        _currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        _sut = new SwitchBranchCommandHandler(_branchService, _userProfileService, _currentUser, _currentBranch);
    }

    #region Happy Path

    [Fact]
    public async Task Handle_Should_UpdateCurrentBranch_And_ReturnRefreshedContext_When_BranchIsValid()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var branches = new List<BranchDto> { new() { Id = branchId, Code = "MAIN" } };

        _currentUser.GetUserId().Returns(userId);
        _branchService.IsActiveBranchOfCurrentTenantAsync(branchId, Arg.Any<CancellationToken>()).Returns(true);
        _branchService.GetAllForCurrentTenantAsync(Arg.Any<CancellationToken>()).Returns(branches);

        var command = new SwitchBranchCommand(branchId);

        // Act
        var result = await _sut.Handle(command, CancellationToken.None);

        // Assert
        result.CurrentBranchId.ShouldBe(branchId);
        result.Branches.ShouldBe(branches);
        await _userProfileService.Received(1).SetCurrentBranchIdAsync(
            userId.ToString(), branchId, Arg.Any<CancellationToken>());
    }

    #endregion

    #region Guards

    [Fact]
    public async Task Handle_Should_Throw_NotFound_When_BranchIsNotActiveOrNotOwnedByTenant()
    {
        // Arrange
        var branchId = Guid.NewGuid();
        _branchService.IsActiveBranchOfCurrentTenantAsync(branchId, Arg.Any<CancellationToken>()).Returns(false);

        var command = new SwitchBranchCommand(branchId);

        // Act
        var act = () => _sut.Handle(command, CancellationToken.None).AsTask();

        // Assert
        await Should.ThrowAsync<NotFoundException>(act);
        await _userProfileService.DidNotReceive().SetCurrentBranchIdAsync(
            Arg.Any<string>(), Arg.Any<Guid?>(), Arg.Any<CancellationToken>());
    }

    #endregion

    #region Branch confinement

    [Fact]
    public async Task Handle_Should_Throw_Forbidden_When_CallerWithoutViewAllSwitchesToAnotherBranch()
    {
        // Arrange
        var ownBranchId = Guid.NewGuid();
        var otherBranchId = Guid.NewGuid();
        _currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(ownBranchId);
        _branchService.IsActiveBranchOfCurrentTenantAsync(otherBranchId, Arg.Any<CancellationToken>()).Returns(true);

        // Act
        var act = () => _sut.Handle(new SwitchBranchCommand(otherBranchId), CancellationToken.None).AsTask();

        // Assert
        await Should.ThrowAsync<ForbiddenException>(act);
        await _userProfileService.DidNotReceive().SetCurrentBranchIdAsync(
            Arg.Any<string>(), Arg.Any<Guid?>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Succeed_When_CallerWithoutViewAllReselectsOwnBranch()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var ownBranchId = Guid.NewGuid();
        _currentUser.GetUserId().Returns(userId);
        _currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(ownBranchId);
        _branchService.IsActiveBranchOfCurrentTenantAsync(ownBranchId, Arg.Any<CancellationToken>()).Returns(true);
        _branchService.GetAllForCurrentTenantAsync(Arg.Any<CancellationToken>())
            .Returns(new List<BranchDto> { new() { Id = ownBranchId, Code = "MAIN" } });

        // Act
        var result = await _sut.Handle(new SwitchBranchCommand(ownBranchId), CancellationToken.None);

        // Assert
        result.CurrentBranchId.ShouldBe(ownBranchId);
        await _userProfileService.Received(1).SetCurrentBranchIdAsync(
            userId.ToString(), ownBranchId, Arg.Any<CancellationToken>());
    }

    #endregion
}
