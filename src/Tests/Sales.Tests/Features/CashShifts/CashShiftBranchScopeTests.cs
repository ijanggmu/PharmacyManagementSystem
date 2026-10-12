using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftById;
using FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftSummary;
using FSH.Modules.Sales.Features.v1.CashShifts.GetCurrentCashShift;
using FSH.Modules.Sales.Features.v1.CashShifts.StartCashShift;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Sales.Tests.Features.CashShifts;

/// <summary>A cash drawer belongs to one branch: shifts open, are found and reconcile per branch.</summary>
public sealed class CashShiftBranchScopeTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    public CashShiftBranchScopeTests() => _currentUser.Name.Returns("cashier");

    public void Dispose() => _db.Dispose();

    private static ICurrentBranch Branch(Guid branchId, bool viewAll = false)
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        branch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(viewAll);
        return branch;
    }

    private static Sale CashSale(Guid branchId, decimal amount)
    {
        var sale = Sale.StartBuilding(branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, amount, 0m, 0m, 1m);
        sale.Finalize("Cash", amount);
        return sale;
    }

    [Fact]
    public async Task StartShift_Should_Allow_OneOpenShiftPerBranch()
    {
        await new StartCashShiftCommandHandler(_db, _currentUser, Branch(_branchA))
            .Handle(new StartCashShiftCommand(100m, null), CancellationToken.None);

        // Another branch can open its own drawer while branch A's is open.
        await new StartCashShiftCommandHandler(_db, _currentUser, Branch(_branchB))
            .Handle(new StartCashShiftCommand(50m, null), CancellationToken.None);

        // A second shift at the same branch is still refused.
        await Should.ThrowAsync<CustomException>(() => new StartCashShiftCommandHandler(_db, _currentUser, Branch(_branchA))
            .Handle(new StartCashShiftCommand(10m, null), CancellationToken.None).AsTask());

        _db.CashShifts.Count(s => s.Status == CashShiftStatus.Open).ShouldBe(2);
    }

    [Fact]
    public async Task GetCurrentShift_Should_ReturnTheShiftOpenAtTheCallersBranch()
    {
        var shiftA = CashShift.Open(_branchA, "a", 100m, null);
        var shiftB = CashShift.Open(_branchB, "b", 50m, null);
        _db.CashShifts.AddRange(shiftA, shiftB);
        await _db.SaveChangesAsync();

        var current = await new GetCurrentCashShiftQueryHandler(_db, Branch(_branchB))
            .Handle(new GetCurrentCashShiftQuery(), CancellationToken.None);

        current.Id.ShouldBe(shiftB.Id);
        current.BranchId.ShouldBe(_branchB);
    }

    [Fact]
    public async Task Summary_Should_CountOnlyTheShiftBranchSales()
    {
        var shift = CashShift.Open(_branchA, "a", 100m, null);
        _db.CashShifts.Add(shift);
        _db.Sales.AddRange(CashSale(_branchA, 40m), CashSale(_branchB, 999m));
        await _db.SaveChangesAsync();

        var summary = await new GetCashShiftSummaryQueryHandler(_db, Branch(_branchA), Substitute.For<Mediator.IMediator>())
            .Handle(new GetCashShiftSummaryQuery(shift.Id), CancellationToken.None);

        summary.CashSalesTotal.ShouldBe(40m);
        summary.ExpectedCash.ShouldBe(140m);
        summary.SalesCount.ShouldBe(1);
    }

    [Fact]
    public async Task GetById_Should_HideOtherBranchShift_FromSingleBranchUser()
    {
        var shift = CashShift.Open(_branchB, "b", 50m, null);
        _db.CashShifts.Add(shift);
        await _db.SaveChangesAsync();

        await Should.ThrowAsync<NotFoundException>(() => new GetCashShiftByIdQueryHandler(_db, Branch(_branchA))
            .Handle(new GetCashShiftByIdQuery(shift.Id), CancellationToken.None).AsTask());

        var seen = await new GetCashShiftByIdQueryHandler(_db, Branch(_branchA, viewAll: true))
            .Handle(new GetCashShiftByIdQuery(shift.Id), CancellationToken.None);
        seen.BranchId.ShouldBe(_branchB);
    }
}
