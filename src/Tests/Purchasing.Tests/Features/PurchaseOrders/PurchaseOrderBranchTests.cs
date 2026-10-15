using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ApprovePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CancelPurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderById;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderStatusCounts;
using FSH.Modules.Purchasing.Services;
using Mediator;
using NSubstitute;
using Purchasing.Tests.Features;

namespace Purchasing.Tests.Features.PurchaseOrders;

/// <summary>A purchase order belongs to the branch that raised it: stamped at creation, carried to its
/// backorder, and used to scope lists, counts and single-order reads.</summary>
public sealed class PurchaseOrderBranchTests : IDisposable
{
    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    private static ICurrentBranch Pinned(Guid branchId)
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        branch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(branchId);
        return branch;
    }

    internal static IReceiptNumberService Numbers()
    {
        var numbers = Substitute.For<IReceiptNumberService>();
        numbers.ResolveBranchCodeAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns("MAIN");
        numbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(1);
        return numbers;
    }

    internal static FSH.Framework.Core.Context.ICurrentUser User(Guid? userId = null)
    {
        var user = Substitute.For<FSH.Framework.Core.Context.ICurrentUser>();
        user.GetUserId().Returns(userId ?? Guid.CreateVersion7());
        user.Name.Returns("clerk1");
        return user;
    }

    [Fact]
    public async Task Create_Should_StampTheCurrentBranch()
    {
        var id = await new CreatePurchaseOrderCommandHandler(_db, Pinned(_branchA), NamesMediator.Create(), Numbers(), User()).Handle(
            new CreatePurchaseOrderCommand(
                Guid.CreateVersion7(), DateTime.UtcNow, null,
                [new PurchaseOrderLineInput(Guid.CreateVersion7(), null, null, 5m, 10m, 15m)]),
            CancellationToken.None);

        _db.PurchaseOrders.Single(o => o.Id == id).BranchId.ShouldBe(_branchA);
    }

    [Fact]
    public void Backorder_Should_InheritTheOrderBranch()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null, branchId: _branchB);
        order.AddLine(Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 2m, 3m, null);

        var backorder = PurchaseOrder.CreateBackorder(
            order, [new PurchaseOrderShortfall(order.Lines[0].MedicineId, 4m, 2m, 3m, null, 0m)], DateTime.UtcNow);

        backorder.BranchId.ShouldBe(_branchB);
    }

    [Fact]
    public async Task StatusCounts_And_GetById_Should_BeConfinedToTheCallersBranch()
    {
        var mine = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null, branchId: _branchA);
        var theirs = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null, branchId: _branchB);
        _db.PurchaseOrders.AddRange(mine, theirs);
        await _db.SaveChangesAsync();

        var counts = await new GetPurchaseOrderStatusCountsQueryHandler(_db, Pinned(_branchA))
            .Handle(new GetPurchaseOrderStatusCountsQuery(), CancellationToken.None);
        counts.Total.ShouldBe(1);

        await Should.ThrowAsync<NotFoundException>(() =>
            new GetPurchaseOrderByIdQueryHandler(_db, Substitute.For<IMediator>(), Pinned(_branchA))
                .Handle(new GetPurchaseOrderByIdQuery(theirs.Id), CancellationToken.None).AsTask());
    }

    [Fact]
    public void AssignLegacyBranch_Should_OnlyFillAMissingBranch()
    {
        var legacy = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null);
        legacy.AssignLegacyBranch(_branchA);
        legacy.AssignLegacyBranch(_branchB);

        legacy.BranchId.ShouldBe(_branchA);
    }

    [Fact]
    public async Task Approve_And_Cancel_Should_Not_Reach_Another_Branchs_Order()
    {
        var theirs = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null, branchId: _branchB);
        theirs.AddLine(Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 2m, 3m, null);
        _db.PurchaseOrders.Add(theirs);
        await _db.SaveChangesAsync();

        await Should.ThrowAsync<NotFoundException>(() =>
            new ApprovePurchaseOrderCommandHandler(_db, Substitute.For<FSH.Framework.Core.Context.ICurrentUser>(), Pinned(_branchA), NamesMediator.Create())
                .Handle(new ApprovePurchaseOrderCommand(theirs.Id), CancellationToken.None).AsTask());
        await Should.ThrowAsync<NotFoundException>(() =>
            new CancelPurchaseOrderCommandHandler(_db, Pinned(_branchA))
                .Handle(new CancelPurchaseOrderCommand(theirs.Id, "wrong supplier"), CancellationToken.None).AsTask());

        _db.ChangeTracker.Clear();
        _db.PurchaseOrders.Single(o => o.Id == theirs.Id).Status.ShouldBe(PurchaseOrderStatus.Draft);
    }

    [Fact]
    public async Task Approve_Should_Work_For_The_Callers_Own_Branch()
    {
        var mine = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null, branchId: _branchA);
        mine.AddLine(Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 2m, 3m, null);
        _db.PurchaseOrders.Add(mine);
        await _db.SaveChangesAsync();

        var user = Substitute.For<FSH.Framework.Core.Context.ICurrentUser>();
        user.Name.Returns("manager1");
        await new ApprovePurchaseOrderCommandHandler(_db, user, Pinned(_branchA), NamesMediator.Create())
            .Handle(new ApprovePurchaseOrderCommand(mine.Id), CancellationToken.None);

        _db.PurchaseOrders.Single(o => o.Id == mine.Id).Status.ShouldBe(PurchaseOrderStatus.Approved);
    }

    [Fact]
    public async Task Create_Should_Refuse_An_Inactive_Supplier()
    {
        var inactive = Guid.CreateVersion7();

        await Should.ThrowAsync<CustomException>(() =>
            new CreatePurchaseOrderCommandHandler(_db, Pinned(_branchA), NamesMediator.Create(inactiveSuppliers: [inactive]), Numbers(), User()).Handle(
                new CreatePurchaseOrderCommand(
                    inactive, DateTime.UtcNow, null,
                    [new PurchaseOrderLineInput(Guid.CreateVersion7(), null, null, 5m, 10m, 15m)]),
                CancellationToken.None).AsTask());

        _db.PurchaseOrders.ShouldBeEmpty();
    }
}
