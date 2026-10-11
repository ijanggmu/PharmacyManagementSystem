using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderById;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderStatusCounts;
using Mediator;
using NSubstitute;

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

    [Fact]
    public async Task Create_Should_StampTheCurrentBranch()
    {
        var id = await new CreatePurchaseOrderCommandHandler(_db, Pinned(_branchA)).Handle(
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
}
