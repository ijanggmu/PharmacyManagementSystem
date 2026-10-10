using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.CashShifts.StartCashShift;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Sales.Tests.Features.CashShifts;

/// <summary>
/// Exercises <see cref="StartCashShiftCommandHandler"/>'s branch resolution — a cash shift is
/// REQUIRED to carry a <c>BranchId</c> (branch-scoping-plan.md §2), resolved via
/// <c>ICurrentBranch.RequireBranchIdAsync</c>. Same NSubstitute-based <c>ICurrentBranch</c> fake
/// pattern as <c>CreateSaleCommandHandlerTests</c>.
/// </summary>
public sealed class StartCashShiftCommandHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly StartCashShiftCommandHandler _sut;

    public StartCashShiftCommandHandlerTests()
    {
        _currentUser.Name.Returns("cashier1");
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _sut = new StartCashShiftCommandHandler(_db, _currentUser, _currentBranch);
    }

    [Fact]
    public async Task Handle_Should_OpenShift_With_ResolvedBranchId()
    {
        // Act
        var shiftId = await _sut.Handle(new StartCashShiftCommand(100m, "morning shift"), CancellationToken.None);

        // Assert
        var saved = await _db.CashShifts.FirstAsync(s => s.Id == shiftId);
        saved.BranchId.ShouldBe(_branchId);
        saved.Status.ShouldBe(CashShiftStatus.Open);
    }

    [Fact]
    public async Task Handle_Should_Throw_When_AShiftIsAlreadyOpen()
    {
        // Arrange
        await _sut.Handle(new StartCashShiftCommand(100m, null), CancellationToken.None);

        // Act & Assert
        await Should.ThrowAsync<CustomException>(
            () => _sut.Handle(new StartCashShiftCommand(50m, null), CancellationToken.None).AsTask());
    }

    public void Dispose() => _db.Dispose();
}
