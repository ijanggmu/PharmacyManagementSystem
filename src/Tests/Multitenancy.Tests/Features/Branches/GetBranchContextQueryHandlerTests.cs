using FSH.Framework.Core.Context;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchContext;
using FSH.Modules.Multitenancy.Features.v1.GetBranchContext;
using NSubstitute;

namespace Multitenancy.Tests.Features.Branches;

public sealed class GetBranchContextQueryHandlerTests
{
    private readonly IBranchService _branchService = Substitute.For<IBranchService>();
    private readonly IUserProfileService _userProfileService = Substitute.For<IUserProfileService>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly GetBranchContextQueryHandler _sut;

    public GetBranchContextQueryHandlerTests()
    {
        _sut = new GetBranchContextQueryHandler(_branchService, _userProfileService, _currentUser);
    }

    [Fact]
    public async Task Handle_Should_ReturnBranchesAndCurrentBranchId()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var currentBranchId = Guid.NewGuid();
        var branches = new List<BranchDto>
        {
            new() { Id = currentBranchId, Code = "MAIN" },
            new() { Id = Guid.NewGuid(), Code = "SECOND" }
        };

        _currentUser.GetUserId().Returns(userId);
        _branchService.GetAllForCurrentTenantAsync(Arg.Any<CancellationToken>()).Returns(branches);
        _userProfileService.GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>())
            .Returns(currentBranchId);

        // Act
        var result = await _sut.Handle(new GetBranchContextQuery(), CancellationToken.None);

        // Assert
        result.CurrentBranchId.ShouldBe(currentBranchId);
        result.Branches.Count.ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_ReturnNullCurrentBranchId_When_UserHasNoSelection()
    {
        // Arrange
        var userId = Guid.NewGuid();
        _currentUser.GetUserId().Returns(userId);
        _branchService.GetAllForCurrentTenantAsync(Arg.Any<CancellationToken>()).Returns([]);
        _userProfileService.GetCurrentBranchIdAsync(userId.ToString(), Arg.Any<CancellationToken>())
            .Returns((Guid?)null);

        // Act
        var result = await _sut.Handle(new GetBranchContextQuery(), CancellationToken.None);

        // Assert
        result.CurrentBranchId.ShouldBeNull();
        result.Branches.ShouldBeEmpty();
    }
}
