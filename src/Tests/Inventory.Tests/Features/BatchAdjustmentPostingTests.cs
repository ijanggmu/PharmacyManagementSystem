using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Batches.AdjustBatchQuantity;
using FSH.Modules.Inventory.Features.v1.Batches.DisposeBatch;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class BatchAdjustmentPostingTests
{
    private static (FSH.Modules.Inventory.Data.InventoryDbContext Db, MedicineBatch Batch) Seed(decimal quantity, decimal cost)
    {
        var db = InventoryDbContextFactory.Create();
        var medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 5, isControlled: false);
        db.Medicines.Add(medicine);
        var batch = MedicineBatch.Create(
            medicine.Id, Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantity, cost, cost * 2, rackLocation: null);
        db.MedicineBatches.Add(batch);
        db.SaveChanges();
        return (db, batch);
    }

    private static List<InventoryAdjustedIntegrationEvent> Capture(IOutboxWriter outbox)
    {
        var events = new List<InventoryAdjustedIntegrationEvent>();
        outbox.AddAsync(Arg.Do<IIntegrationEvent>(e =>
        {
            if (e is InventoryAdjustedIntegrationEvent adjusted)
            {
                events.Add(adjusted);
            }
        }), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        return events;
    }

    [Fact]
    public async Task DisposeBatch_Should_PublishLossAtBatchCost()
    {
        var (db, batch) = Seed(quantity: 20m, cost: 3m);
        using var _ = db;
        var outbox = Substitute.For<IOutboxWriter>();
        var events = Capture(outbox);

        await new DisposeBatchCommandHandler(db, outbox, Substitute.For<ICurrentUser>(), BranchOf(batch.BranchId))
            .Handle(new DisposeBatchCommand(batch.Id, "expired"), CancellationToken.None);

        var adjusted = events.ShouldHaveSingleItem();
        adjusted.ValueChange.ShouldBe(-60m);
        adjusted.BranchId.ShouldBe(batch.BranchId);
    }

    [Theory]
    [InlineData(15, -15)]
    [InlineData(25, 15)]
    public async Task AdjustBatchQuantity_Should_PublishSignedValueChange(decimal newQuantity, decimal expectedValue)
    {
        var (db, batch) = Seed(quantity: 20m, cost: 3m);
        using var _ = db;
        var outbox = Substitute.For<IOutboxWriter>();
        var events = Capture(outbox);

        await new AdjustBatchQuantityCommandHandler(db, outbox, Substitute.For<ICurrentUser>(), BranchOf(batch.BranchId))
            .Handle(new AdjustBatchQuantityCommand(batch.Id, newQuantity, "stock count"), CancellationToken.None);

        events.ShouldHaveSingleItem().ValueChange.ShouldBe(expectedValue);
    }

    [Fact]
    public async Task AdjustBatchQuantity_Should_Throw_NotFound_When_Batch_Belongs_To_Another_Branch()
    {
        var (db, batch) = Seed(quantity: 20m, cost: 3m);
        using var _ = db;

        await Should.ThrowAsync<NotFoundException>(() => new AdjustBatchQuantityCommandHandler(
                db, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), BranchOf(Guid.CreateVersion7()))
            .Handle(new AdjustBatchQuantityCommand(batch.Id, 5m, "stock count"), CancellationToken.None).AsTask());

        db.MedicineBatches.Single().QuantityOnHand.ShouldBe(20m);
    }

    [Fact]
    public async Task DisposeBatch_Should_Throw_NotFound_When_Batch_Belongs_To_Another_Branch()
    {
        var (db, batch) = Seed(quantity: 20m, cost: 3m);
        using var _ = db;

        await Should.ThrowAsync<NotFoundException>(() => new DisposeBatchCommandHandler(
                db, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), BranchOf(Guid.CreateVersion7()))
            .Handle(new DisposeBatchCommand(batch.Id, "expired"), CancellationToken.None).AsTask());

        db.MedicineBatches.Single().IsDisposed.ShouldBeFalse();
    }

    [Fact]
    public async Task AdjustBatchQuantity_Should_Apply_To_Committed_Quantity_When_Batch_Changed_Since_Another_Read()
    {
        // Another writer (a sale) took the lot from 20 to 12 after this context first read it. The adjustment
        // must compute its delta from the committed 12, not the stale 20 it saw earlier.
        string store = Guid.NewGuid().ToString();
        using var db = InventoryDbContextFactory.Create(store);
        var batch = MedicineBatch.Create(
            Guid.CreateVersion7(), Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 20m, 3m, 6m, null);
        db.MedicineBatches.Add(batch);
        await db.SaveChangesAsync();

        using (var other = InventoryDbContextFactory.Create(store))
        {
            other.MedicineBatches.Single().Deduct(8m);
            await other.SaveChangesAsync();
        }

        var outbox = Substitute.For<IOutboxWriter>();
        var events = Capture(outbox);
        await new AdjustBatchQuantityCommandHandler(db, outbox, Substitute.For<ICurrentUser>(), BranchOf(batch.BranchId))
            .Handle(new AdjustBatchQuantityCommand(batch.Id, 10m, "stock count"), CancellationToken.None);

        // 12 -> 10 is a loss of 2 units at cost 3, not 20 -> 10.
        events.ShouldHaveSingleItem().ValueChange.ShouldBe(-6m);
        db.InventoryTransactions.Single().QuantityDelta.ShouldBe(-2m);
    }

    /// <summary>A caller confined to <paramref name="branchId"/> (no Branches.ViewAll).</summary>
    private static ICurrentBranch BranchOf(Guid branchId)
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);
        return currentBranch;
    }
}
