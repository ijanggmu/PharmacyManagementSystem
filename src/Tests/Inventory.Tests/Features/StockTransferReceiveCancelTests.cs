using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.StockTransfers.CancelStockTransfer;
using FSH.Modules.Inventory.Features.v1.StockTransfers.CreateStockTransfer;
using FSH.Modules.Inventory.Features.v1.StockTransfers.ReceiveStockTransfer;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// A transfer is received once, by the destination; cancelled once, by the source; and its receipt
/// publishes the GL move between the two branches at cost.
/// </summary>
public sealed class StockTransferReceiveCancelTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly Guid _from = Guid.CreateVersion7();
    private readonly Guid _to = Guid.CreateVersion7();
    private readonly Guid _medicineId = Guid.CreateVersion7();

    public StockTransferReceiveCancelTests() => _currentUser.GetUserId().Returns(Guid.CreateVersion7());

    private static ICurrentBranch At(Guid branchId, bool viewAll = false)
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(viewAll);
        return currentBranch;
    }

    private async Task<Guid> DispatchAsync(decimal quantity)
    {
        _db.MedicineBatches.Add(MedicineBatch.Create(
            _medicineId, _from, "T-1", NepalClock.Today().AddMonths(6), 20m, 4m, 8m, null));
        await _db.SaveChangesAsync();

        var from = At(_from);
        var branchService = Substitute.For<IBranchService>();
        branchService.IsActiveBranchOfCurrentTenantAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns(true);
        return await new CreateStockTransferCommandHandler(_db, _currentUser, from, branchService, new StockDeductionService(_db, from))
            .Handle(new CreateStockTransferCommand(_from, _to, null, [new StockTransferLineInput(_medicineId, quantity)]), CancellationToken.None);
    }

    private ReceiveStockTransferCommandHandler Receiver(ICurrentBranch branch, IOutboxWriter? outbox = null) =>
        new(_db, _currentUser, branch, outbox ?? Substitute.For<IOutboxWriter>());

    [Fact]
    public async Task Receive_Should_Restock_Destination_And_Publish_Transfer_At_Cost()
    {
        var transferId = await DispatchAsync(5m);
        var outbox = Substitute.For<IOutboxWriter>();
        StockTransferReceivedIntegrationEvent? published = null;
        outbox.AddAsync(Arg.Do<IIntegrationEvent>(e => published = e as StockTransferReceivedIntegrationEvent), Arg.Any<CancellationToken>())
            .Returns(Task.CompletedTask);

        await Receiver(At(_to), outbox).Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None);

        _db.MedicineBatches.Single(b => b.BranchId == _to).QuantityOnHand.ShouldBe(5m);
        published.ShouldNotBeNull();
        published.FromBranchId.ShouldBe(_from);
        published.ToBranchId.ShouldBe(_to);
        published.TotalCost.ShouldBe(20m);
        published.Lines.ShouldHaveSingleItem().BatchNo.ShouldBe("T-1");
    }

    [Fact]
    public async Task Receive_Twice_Should_Conflict_And_Not_Restock_Again()
    {
        var transferId = await DispatchAsync(5m);
        await Receiver(At(_to)).Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(
            () => Receiver(At(_to)).Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        _db.MedicineBatches.Single(b => b.BranchId == _to).QuantityOnHand.ShouldBe(5m);
    }

    [Fact]
    public async Task Receive_From_Another_Branch_Should_Be_Forbidden()
    {
        var transferId = await DispatchAsync(5m);

        await Should.ThrowAsync<ForbiddenException>(
            () => Receiver(At(Guid.CreateVersion7())).Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None).AsTask());
        await Should.ThrowAsync<ForbiddenException>(
            () => Receiver(At(_from)).Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None).AsTask());

        _db.StockTransfers.Single().Status.ShouldBe(StockTransferStatus.InTransit);
    }

    [Fact]
    public async Task Receive_By_ViewAll_User_Should_Be_Allowed()
    {
        var transferId = await DispatchAsync(5m);

        await Receiver(At(_from, viewAll: true)).Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None);

        _db.StockTransfers.Single().Status.ShouldBe(StockTransferStatus.Completed);
    }

    [Fact]
    public async Task Cancel_Should_Only_Be_Allowed_From_Source_Branch()
    {
        var transferId = await DispatchAsync(5m);

        await Should.ThrowAsync<ForbiddenException>(() => new CancelStockTransferCommandHandler(_db, _currentUser, At(_to))
            .Handle(new CancelStockTransferCommand(transferId, "wrong item"), CancellationToken.None).AsTask());

        await new CancelStockTransferCommandHandler(_db, _currentUser, At(_from))
            .Handle(new CancelStockTransferCommand(transferId, "wrong item"), CancellationToken.None);

        _db.MedicineBatches.Where(b => b.BranchId == _from).Sum(b => b.QuantityOnHand).ShouldBe(20m);
    }

    [Fact]
    public async Task Cancel_After_Receive_Should_Conflict_And_Not_Restock_Source()
    {
        var transferId = await DispatchAsync(5m);
        await Receiver(At(_to)).Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None);

        await Should.ThrowAsync<CustomException>(() => new CancelStockTransferCommandHandler(_db, _currentUser, At(_from))
            .Handle(new CancelStockTransferCommand(transferId, "too late"), CancellationToken.None).AsTask());

        _db.MedicineBatches.Where(b => b.BranchId == _from).Sum(b => b.QuantityOnHand).ShouldBe(15m);
    }

    public void Dispose() => _db.Dispose();
}
